import { after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../src/store.ts';
import { FakeCatalog, start, userToken } from './helpers.ts';

const store = new MemoryStore();
const catalog = new FakeCatalog();
const { server, events, call } = start(store, catalog);
after(() => void server.close());

const USER = '11111111-1111-1111-1111-111111111111';
type Cart = { id: string; lines: { productId: string; quantity: number; unitPrice: number; latestUnitPrice?: number }[]; coupon: string | null; total: number; currency: string };
const json = async (r: Response) => (await r.json()) as Cart;

beforeEach(async () => {
  store.carts.clear();
  store.lines.clear();
  store.coupons.clear();
  events.published.length = 0;
  catalog.down = false;
  catalog.products.clear();
  catalog.add('p-1', 1000);
  catalog.add('p-2', 250);
  catalog.add('p-eur', 500, 'EUR');
  await store.upsertCoupon({ code: 'TEN', percent_off: 10, expires_at: null });
  await store.upsertCoupon({ code: 'OLD', percent_off: 50, expires_at: new Date('2020-01-01') });
});

test('guest cart: created on first add, found again by x-cart-id', async () => {
  const added = await json(await call('/cart/items', { method: 'POST', body: { productId: 'p-1', quantity: 2 } }));
  assert.equal(added.total, 2000);
  assert.equal(added.currency, 'USD');
  const again = await json(await call('/cart', { cartId: added.id }));
  assert.equal(again.id, added.id);
  assert.equal(again.lines[0].quantity, 2);
});

test('adding the same product twice sums the quantity', async () => {
  const first = await json(await call('/cart/items', { method: 'POST', body: { productId: 'p-1', quantity: 1 } }));
  const second = await json(await call('/cart/items', { method: 'POST', body: { productId: 'p-1', quantity: 2 }, cartId: first.id }));
  assert.equal(second.lines.length, 1);
  assert.equal(second.lines[0].quantity, 3);
});

test('price is snapshotted at add time and survives a catalog price change', async () => {
  const a = await json(await call('/cart/items', { method: 'POST', body: { productId: 'p-1', quantity: 1 } }));
  catalog.add('p-1', 9999);
  const b = await json(await call('/cart/items', { method: 'POST', body: { productId: 'p-2', quantity: 1 }, cartId: a.id }));
  assert.equal(b.lines.find((l) => l.productId === 'p-1')!.unitPrice, 1000);
  assert.equal(b.total, 1250);
});

test('add validates input, unknown product and catalog outage', async () => {
  const add = (body: unknown) => call('/cart/items', { method: 'POST', body });
  assert.equal((await add({ productId: 'p-1', quantity: 0 })).status, 400);
  assert.equal((await add({ productId: 'p-1', quantity: 1.5 })).status, 400);
  assert.equal((await add({ productId: 'nope', quantity: 1 })).status, 404);
  catalog.down = true;
  assert.equal((await add({ productId: 'p-1', quantity: 1 })).status, 502);
});

test('a cart holds one currency', async () => {
  const a = await json(await call('/cart/items', { method: 'POST', body: { productId: 'p-1', quantity: 1 } }));
  const r = await call('/cart/items', { method: 'POST', body: { productId: 'p-eur', quantity: 1 }, cartId: a.id });
  assert.equal(r.status, 409);
});

test('quantity edit, remove, and quantity 0 removes the line', async () => {
  const a = await json(await call('/cart/items', { method: 'POST', body: { productId: 'p-1', quantity: 1 } }));
  const patched = await json(await call('/cart/items/p-1', { method: 'PATCH', body: { quantity: 4 }, cartId: a.id }));
  assert.equal(patched.total, 4000);
  const zeroed = await json(await call('/cart/items/p-1', { method: 'PATCH', body: { quantity: 0 }, cartId: a.id }));
  assert.equal(zeroed.lines.length, 0);
  assert.equal((await call('/cart/items/p-1', { method: 'DELETE', cartId: a.id })).status, 404);
});

test('coupon: percent off the subtotal; invalid and expired codes are 422', async () => {
  const a = await json(await call('/cart/items', { method: 'POST', body: { productId: 'p-1', quantity: 3 } }));
  const c = await json(await call('/cart/coupon', { method: 'POST', body: { code: 'ten' }, cartId: a.id }));
  assert.equal(c.coupon, 'TEN');
  assert.equal(c.total, 2700);
  assert.equal((await call('/cart/coupon', { method: 'POST', body: { code: 'NOPE' }, cartId: a.id })).status, 422);
  assert.equal((await call('/cart/coupon', { method: 'POST', body: { code: 'OLD' }, cartId: a.id })).status, 422);
});

test('login merge: guest lines add into the user cart and the guest cart is gone', async () => {
  const token = userToken(USER);
  await call('/cart/items', { method: 'POST', body: { productId: 'p-1', quantity: 1 }, token });
  const guest = await json(await call('/cart/items', { method: 'POST', body: { productId: 'p-1', quantity: 2 } }));
  await call('/cart/items', { method: 'POST', body: { productId: 'p-2', quantity: 1 }, cartId: guest.id });
  await call('/cart/coupon', { method: 'POST', body: { code: 'TEN' }, cartId: guest.id });

  const merged = await json(await call('/cart/merge', { method: 'POST', body: { guestCartId: guest.id }, token }));
  assert.deepEqual(merged.lines.map((l) => [l.productId, l.quantity]), [['p-1', 3], ['p-2', 1]]);
  assert.equal(merged.coupon, 'TEN');
  assert.equal(await store.findCart(guest.id), null);
  assert.equal((await call('/cart/merge', { method: 'POST', body: { guestCartId: guest.id } })).status, 401);
});

test('merge ignores a guest id that belongs to another user', async () => {
  const other = await json(await call('/cart/items', { method: 'POST', body: { productId: 'p-1', quantity: 1 }, token: userToken('22222222-2222-2222-2222-222222222222') }));
  const merged = await json(await call('/cart/merge', { method: 'POST', body: { guestCartId: other.id }, token: userToken(USER) }));
  assert.equal(merged.lines.length, 0);
  assert.ok(await store.findCart(other.id));
});

test('an expired cart is replaced by a fresh empty one', async () => {
  const a = await json(await call('/cart/items', { method: 'POST', body: { productId: 'p-1', quantity: 1 } }));
  store.carts.get(a.id)!.expires_at = new Date(Date.now() - 1000);
  const next = await json(await call('/cart', { cartId: a.id }));
  assert.notEqual(next.id, a.id);
  assert.equal(next.lines.length, 0);
});

test('checkout publishes cart.checked_out matching the contract and closes the cart', async () => {
  const token = userToken(USER);
  await call('/cart/items', { method: 'POST', body: { productId: 'p-1', quantity: 2 }, token });
  await call('/cart/coupon', { method: 'POST', body: { code: 'TEN' }, token });
  const r = await call('/cart/checkout', { method: 'POST', token });
  assert.equal(r.status, 202);
  const ev = events.published.at(-1)!;
  assert.equal(ev.key, 'cart.checked_out');
  assert.deepEqual(ev.body, { cartId: ((await r.json()) as { cartId: string }).cartId, userId: USER, total: 1800, currency: 'USD', lines: [{ productId: 'p-1', quantity: 2 }] });
  const fresh = await json(await call('/cart', { token }));
  assert.equal(fresh.lines.length, 0);
});

test('checkout needs a login and a non-empty cart', async () => {
  assert.equal((await call('/cart/checkout', { method: 'POST' })).status, 401);
  assert.equal((await call('/cart/checkout', { method: 'POST', token: userToken(USER) })).status, 409);
});
