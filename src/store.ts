import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

export interface CartRow {
  id: string;
  user_id: string | null;
  status: 'active' | 'checked_out';
  coupon_code: string | null;
  currency: string | null;
  expires_at: Date;
}

export interface LineRow {
  product_id: string;
  quantity: number;
  unit_price: number;
  latest_price: number | null;
}

export interface CouponRow {
  code: string;
  percent_off: number;
  expires_at: Date | null;
}

export interface Store {
  findCart(id: string): Promise<CartRow | null>;
  findActiveUserCart(userId: string): Promise<CartRow | null>;
  createCart(userId: string | null, expiresAt: Date): Promise<CartRow>;
  touch(cartId: string, expiresAt: Date): Promise<void>;
  setCurrency(cartId: string, currency: string): Promise<void>;
  setCoupon(cartId: string, code: string | null): Promise<void>;
  setStatus(cartId: string, status: CartRow['status']): Promise<void>;
  getLines(cartId: string): Promise<LineRow[]>;
  /** Adds `quantity` to an existing line, or inserts it with the given price snapshot. */
  addToLine(cartId: string, productId: string, quantity: number, unitPrice: number): Promise<void>;
  setLineQuantity(cartId: string, productId: string, quantity: number): Promise<boolean>;
  removeLine(cartId: string, productId: string): Promise<boolean>;
  deleteCart(cartId: string): Promise<void>;
  getCoupon(code: string): Promise<CouponRow | null>;
  upsertCoupon(c: CouponRow): Promise<void>;
  recordLatestPrice(productId: string, price: number): Promise<number>;
}

export class PgStore implements Store {
  constructor(private pool: Pool) {}

  async findCart(id: string) {
    return (await this.pool.query<CartRow>('SELECT * FROM carts WHERE id = $1', [id])).rows[0] ?? null;
  }
  async findActiveUserCart(userId: string) {
    return (await this.pool.query<CartRow>("SELECT * FROM carts WHERE user_id = $1 AND status = 'active'", [userId])).rows[0] ?? null;
  }
  async createCart(userId: string | null, expiresAt: Date) {
    return (await this.pool.query<CartRow>('INSERT INTO carts (user_id, expires_at) VALUES ($1, $2) RETURNING *', [userId, expiresAt])).rows[0];
  }
  async touch(cartId: string, expiresAt: Date) {
    await this.pool.query('UPDATE carts SET expires_at = $2, updated_at = now() WHERE id = $1', [cartId, expiresAt]);
  }
  async setCurrency(cartId: string, currency: string) {
    await this.pool.query('UPDATE carts SET currency = $2 WHERE id = $1', [cartId, currency]);
  }
  async setCoupon(cartId: string, code: string | null) {
    await this.pool.query('UPDATE carts SET coupon_code = $2 WHERE id = $1', [cartId, code]);
  }
  async setStatus(cartId: string, status: CartRow['status']) {
    await this.pool.query('UPDATE carts SET status = $2 WHERE id = $1', [cartId, status]);
  }
  async getLines(cartId: string) {
    return (await this.pool.query<LineRow>('SELECT product_id, quantity, unit_price, latest_price FROM cart_lines WHERE cart_id = $1 ORDER BY product_id', [cartId])).rows;
  }
  async addToLine(cartId: string, productId: string, quantity: number, unitPrice: number) {
    await this.pool.query(
      `INSERT INTO cart_lines (cart_id, product_id, quantity, unit_price) VALUES ($1, $2, $3, $4)
       ON CONFLICT (cart_id, product_id) DO UPDATE SET quantity = cart_lines.quantity + EXCLUDED.quantity`,
      [cartId, productId, quantity, unitPrice],
    );
  }
  async setLineQuantity(cartId: string, productId: string, quantity: number) {
    return ((await this.pool.query('UPDATE cart_lines SET quantity = $3 WHERE cart_id = $1 AND product_id = $2', [cartId, productId, quantity])).rowCount ?? 0) > 0;
  }
  async removeLine(cartId: string, productId: string) {
    return ((await this.pool.query('DELETE FROM cart_lines WHERE cart_id = $1 AND product_id = $2', [cartId, productId])).rowCount ?? 0) > 0;
  }
  async deleteCart(cartId: string) {
    await this.pool.query('DELETE FROM carts WHERE id = $1', [cartId]);
  }
  async getCoupon(code: string) {
    return (await this.pool.query<CouponRow>('SELECT * FROM coupons WHERE code = $1', [code])).rows[0] ?? null;
  }
  async upsertCoupon(c: CouponRow) {
    await this.pool.query(
      'INSERT INTO coupons (code, percent_off, expires_at) VALUES ($1, $2, $3) ON CONFLICT (code) DO UPDATE SET percent_off = $2, expires_at = $3',
      [c.code, c.percent_off, c.expires_at],
    );
  }
  async recordLatestPrice(productId: string, price: number) {
    return (await this.pool.query('UPDATE cart_lines SET latest_price = $2 WHERE product_id = $1', [productId, price])).rowCount ?? 0;
  }
}

/** In-memory store for unit tests. Returns copies, like a database. */
export class MemoryStore implements Store {
  carts = new Map<string, CartRow>();
  lines = new Map<string, LineRow[]>();
  coupons = new Map<string, CouponRow>();

  async findCart(id: string) { const c = this.carts.get(id); return c ? { ...c } : null; }
  async findActiveUserCart(userId: string) {
    const c = [...this.carts.values()].find((x) => x.user_id === userId && x.status === 'active');
    return c ? { ...c } : null;
  }
  async createCart(userId: string | null, expiresAt: Date) {
    const c: CartRow = { id: randomUUID(), user_id: userId, status: 'active', coupon_code: null, currency: null, expires_at: expiresAt };
    this.carts.set(c.id, c);
    this.lines.set(c.id, []);
    return { ...c };
  }
  async touch(cartId: string, expiresAt: Date) { const c = this.carts.get(cartId); if (c) c.expires_at = expiresAt; }
  async setCurrency(cartId: string, currency: string) { const c = this.carts.get(cartId); if (c) c.currency = currency; }
  async setCoupon(cartId: string, code: string | null) { const c = this.carts.get(cartId); if (c) c.coupon_code = code; }
  async setStatus(cartId: string, status: CartRow['status']) { const c = this.carts.get(cartId); if (c) c.status = status; }
  async getLines(cartId: string) {
    return [...(this.lines.get(cartId) ?? [])].sort((a, b) => a.product_id.localeCompare(b.product_id)).map((l) => ({ ...l }));
  }
  async addToLine(cartId: string, productId: string, quantity: number, unitPrice: number) {
    const ls = this.lines.get(cartId)!;
    const l = ls.find((x) => x.product_id === productId);
    if (l) l.quantity += quantity;
    else ls.push({ product_id: productId, quantity, unit_price: unitPrice, latest_price: null });
  }
  async setLineQuantity(cartId: string, productId: string, quantity: number) {
    const l = this.lines.get(cartId)?.find((x) => x.product_id === productId);
    if (!l) return false;
    l.quantity = quantity;
    return true;
  }
  async removeLine(cartId: string, productId: string) {
    const ls = this.lines.get(cartId) ?? [];
    const i = ls.findIndex((x) => x.product_id === productId);
    if (i < 0) return false;
    ls.splice(i, 1);
    return true;
  }
  async deleteCart(cartId: string) { this.carts.delete(cartId); this.lines.delete(cartId); }
  async getCoupon(code: string) { const c = this.coupons.get(code); return c ? { ...c } : null; }
  async upsertCoupon(c: CouponRow) { this.coupons.set(c.code, { ...c }); }
  async recordLatestPrice(productId: string, price: number) {
    let n = 0;
    for (const ls of this.lines.values()) for (const l of ls) if (l.product_id === productId) { l.latest_price = price; n++; }
    return n;
  }
}
