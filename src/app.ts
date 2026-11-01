import express, { type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import type { CatalogClient } from './clients/catalog.ts';
import type { Config } from './config.ts';
import type { Publisher } from './events.ts';
import type { CartRow, LineRow, Store } from './store.ts';

interface Claims { sub: string; role: string; tenant: string }

/** Response shape from shoplab-contracts openapi/cart-api.yaml. */
export async function toCart(store: Store, cart: CartRow) {
  const lines = await store.getLines(cart.id);
  const subtotal = lines.reduce((n, l) => n + l.quantity * l.unit_price, 0);
  const coupon = cart.coupon_code ? await store.getCoupon(cart.coupon_code) : null;
  const discount = coupon && !(coupon.expires_at && coupon.expires_at <= new Date()) ? Math.round((subtotal * coupon.percent_off) / 100) : 0;
  return {
    id: cart.id,
    lines: lines.map((l) => ({
      productId: l.product_id,
      quantity: l.quantity,
      unitPrice: l.unit_price,
      ...(l.latest_price !== null && l.latest_price !== l.unit_price ? { latestUnitPrice: l.latest_price } : {}),
    })),
    coupon: cart.coupon_code,
    total: subtotal - discount,
    currency: cart.currency ?? 'USD',
  };
}

export interface Deps { cfg: Config; store: Store; events: Publisher; catalog: CatalogClient }

export function createApp({ cfg, store, events, catalog }: Deps) {
  const app = express();
  app.use(express.json());

  const expiry = () => new Date(Date.now() + cfg.cartTtlDays * 86_400_000);

  const claimsOf = (req: Request): Claims | null => {
    const h = req.header('authorization');
    if (!h?.startsWith('Bearer ')) return null;
    try { return jwt.verify(h.slice(7), cfg.jwtSecret) as Claims; } catch { return null; }
  };

  /** Resolves the caller's cart: a user's active cart, or a guest cart named by `x-cart-id`. Expired carts are replaced. */
  const resolveCart = async (req: Request): Promise<{ cart: CartRow; claims: Claims | null }> => {
    const claims = claimsOf(req);
    let cart: CartRow | null = null;
    if (claims) cart = await store.findActiveUserCart(claims.sub);
    else {
      const id = req.header('x-cart-id');
      const found = id ? await store.findCart(id).catch(() => null) : null;
      if (found && found.user_id === null && found.status === 'active') cart = found;
    }
    if (cart && cart.expires_at <= new Date()) {
      await store.deleteCart(cart.id);
      cart = null;
    }
    return { cart: cart ?? (await store.createCart(claims?.sub ?? null, expiry())), claims };
  };

  const send = async (res: Response, cart: CartRow, status = 200) => {
    await store.touch(cart.id, expiry());
    res.status(status).json(await toCart(store, cart));
  };

  app.get('/healthz', (_req, res) => void res.json({ ok: true }));

  app.get('/cart', async (req, res) => send(res, (await resolveCart(req)).cart));

  app.post('/cart/items', async (req, res) => {
    const { productId, quantity } = req.body ?? {};
    if (typeof productId !== 'string' || !Number.isInteger(quantity) || quantity < 1) return void res.status(400).json({ error: 'invalid_request' });
    const product = await catalog.getProduct(productId).catch(() => 'down' as const);
    if (product === 'down') return void res.status(502).json({ error: 'catalog_unavailable' });
    if (!product) return void res.status(404).json({ error: 'product_not_found' });
    const { cart } = await resolveCart(req);
    if (cart.currency && cart.currency !== product.price.currency) return void res.status(409).json({ error: 'currency_mismatch' });
    if (!cart.currency) {
      await store.setCurrency(cart.id, product.price.currency);
      cart.currency = product.price.currency;
    }
    await store.addToLine(cart.id, productId, quantity, product.price.amount);
    await send(res, cart);
  });

  app.patch('/cart/items/:productId', async (req, res) => {
    const quantity = req.body?.quantity;
    if (!Number.isInteger(quantity) || quantity < 0) return void res.status(400).json({ error: 'invalid_request' });
    const { cart } = await resolveCart(req);
    const ok = quantity === 0 ? await store.removeLine(cart.id, req.params.productId) : await store.setLineQuantity(cart.id, req.params.productId, quantity);
    if (!ok) return void res.status(404).json({ error: 'line_not_found' });
    await send(res, cart);
  });

  app.delete('/cart/items/:productId', async (req, res) => {
    const { cart } = await resolveCart(req);
    if (!(await store.removeLine(cart.id, req.params.productId))) return void res.status(404).json({ error: 'line_not_found' });
    await send(res, cart);
  });

  app.post('/cart/coupon', async (req, res) => {
    const code = req.body?.couponCode;
    const coupon = typeof code === 'string' ? await store.getCoupon(code.toUpperCase()) : null;
    if (!coupon || (coupon.expires_at && coupon.expires_at <= new Date())) return void res.status(422).json({ error: 'invalid_coupon' });
    const { cart } = await resolveCart(req);
    await store.setCoupon(cart.id, coupon.code);
    cart.coupon_code = coupon.code;
    await send(res, cart);
  });

  /** Merges the guest cart named by `guestCartId` into the logged-in user's cart. Quantities add up; the user's price snapshot wins. */
  app.post('/cart/merge', async (req, res) => {
    const claims = claimsOf(req);
    if (!claims) return void res.status(401).json({ error: 'unauthorized' });
    const guestId = req.body?.guestCartId;
    const { cart } = await resolveCart(req);
    const guest = typeof guestId === 'string' ? await store.findCart(guestId).catch(() => null) : null;
    if (guest && guest.user_id === null && guest.status === 'active' && guest.expires_at > new Date()) {
      if (!cart.currency && guest.currency) {
        await store.setCurrency(cart.id, guest.currency);
        cart.currency = guest.currency;
      }
      if (!cart.coupon_code && guest.coupon_code) {
        await store.setCoupon(cart.id, guest.coupon_code);
        cart.coupon_code = guest.coupon_code;
      }
      if (!guest.currency || guest.currency === cart.currency) {
        for (const l of await store.getLines(guest.id)) await store.addToLine(cart.id, l.product_id, l.quantity, l.unit_price);
      }
      await store.deleteCart(guest.id);
    }
    await send(res, cart);
  });

  app.post('/cart/checkout', async (req, res) => {
    const claims = claimsOf(req);
    if (!claims) return void res.status(401).json({ error: 'unauthorized' });
    const { cart } = await resolveCart(req);
    const body = await toCart(store, cart);
    if (body.lines.length === 0) return void res.status(409).json({ error: 'empty_cart' });
    await store.setStatus(cart.id, 'checked_out');
    await events.publish('cart.checked_out', {
      cartId: cart.id,
      userId: claims.sub,
      total: body.total,
      currency: body.currency,
      lines: body.lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
    });
    res.status(202).json({ cartId: cart.id });
  });

  return app;
}

export type { LineRow };
