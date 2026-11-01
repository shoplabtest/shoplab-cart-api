import { resolve } from 'node:path';
import { Pool } from 'pg';
import { loadConfig } from './config.ts';
import { migrate } from './migrate.ts';
import { PgStore, type CouponRow, type Store } from './store.ts';

export const SEED_COUPONS: CouponRow[] = [
  { code: 'WELCOME10', percent_off: 10, expires_at: null },
  { code: 'SPRING25', percent_off: 25, expires_at: new Date('2099-01-01T00:00:00Z') },
  { code: 'EXPIRED5', percent_off: 5, expires_at: new Date('2020-01-01T00:00:00Z') },
];

export async function seed(store: Store) {
  for (const c of SEED_COUPONS) await store.upsertCoupon(c);
  return SEED_COUPONS.length;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  await migrate(pool, resolve(import.meta.dirname, '../migrations'));
  console.log(`seeded ${await seed(new PgStore(pool))} coupons`);
  await pool.end();
}
