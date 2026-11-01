import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { handleProductUpdated } from '../src/consumer.ts';
import { migrate } from '../src/migrate.ts';
import { seed } from '../src/seed.ts';
import { PgStore } from '../src/store.ts';
import { toCart } from '../src/app.ts';

// Runs against a real, empty Postgres. CI provides TEST_DATABASE_URL; locally the test is skipped.
const url = process.env.TEST_DATABASE_URL;

test('migrations apply to an empty database and PgStore handles a full cart flow', { skip: !url }, async () => {
  const pool = new Pool({ connectionString: url });
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    const dir = resolve(import.meta.dirname, '../migrations');
    assert.equal((await migrate(pool, dir)).length, 3);
    assert.deepEqual(await migrate(pool, dir), []);

    const store = new PgStore(pool);
    assert.equal(await seed(store), 3);
    assert.equal((await store.getCoupon('WELCOME10'))?.percent_off, 10);

    const userId = '11111111-1111-1111-1111-111111111111';
    const expires = new Date(Date.now() + 86_400_000);
    const cart = await store.createCart(userId, expires);
    await assert.rejects(store.createCart(userId, expires), /carts_one_active_per_user/);

    await store.addToLine(cart.id, 'p-1', 1, 1000);
    await store.addToLine(cart.id, 'p-1', 2, 5555);
    await store.setCoupon(cart.id, 'WELCOME10');
    assert.equal(await handleProductUpdated(store, { productId: 'p-1', price: 1100, currency: 'USD' }), 1);
    const body = await toCart(store, (await store.findCart(cart.id))!);
    assert.deepEqual(body.lines, [{ productId: 'p-1', quantity: 3, unitPrice: 1000, latestUnitPrice: 1100 }]);
    assert.equal(body.total, 2700);

    await store.setStatus(cart.id, 'checked_out');
    assert.ok(await store.createCart(userId, expires));
    await store.deleteCart(cart.id);
    assert.deepEqual(await store.getLines(cart.id), []);
  } finally {
    await pool.end();
  }
});
