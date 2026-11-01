import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleProductUpdated } from '../src/consumer.ts';
import { MemoryStore } from '../src/store.ts';
import { toCart } from '../src/app.ts';

test('product.updated records the latest price without touching the snapshot', async () => {
  const store = new MemoryStore();
  const cart = await store.createCart(null, new Date(Date.now() + 1e6));
  await store.addToLine(cart.id, 'p-1', 2, 1000);
  assert.equal(await handleProductUpdated(store, { productId: 'p-1', price: 1200, currency: 'USD' }), 1);
  const body = await toCart(store, cart);
  assert.equal(body.lines[0].unitPrice, 1000);
  assert.equal(body.lines[0].latestUnitPrice, 1200);
  assert.equal(body.total, 2000);
});

test('product.updated with a non-integer price is ignored', async () => {
  const store = new MemoryStore();
  const cart = await store.createCart(null, new Date(Date.now() + 1e6));
  await store.addToLine(cart.id, 'p-1', 1, 1000);
  assert.equal(await handleProductUpdated(store, { productId: 'p-1', price: '12.00' as unknown as number, currency: 'USD' }), 0);
});
