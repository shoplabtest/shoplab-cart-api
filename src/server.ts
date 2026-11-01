import { resolve } from 'node:path';
import { Pool } from 'pg';
import { createApp } from './app.ts';
import { HttpCatalogClient } from './clients/catalog.ts';
import { loadConfig } from './config.ts';
import { startConsumer } from './consumer.ts';
import { NullPublisher, connectPublisher } from './events.ts';
import { migrate } from './migrate.ts';
import { PgStore } from './store.ts';

const cfg = loadConfig();
const pool = new Pool({ connectionString: cfg.databaseUrl });
await migrate(pool, resolve(import.meta.dirname, '../migrations'));
const store = new PgStore(pool);
const events = cfg.rabbitUrl ? await connectPublisher(cfg.rabbitUrl) : new NullPublisher();
if (cfg.rabbitUrl) await startConsumer(cfg.rabbitUrl, store);
createApp({ cfg, store, events, catalog: new HttpCatalogClient(cfg) }).listen(cfg.port, () => console.log(`cart-api listening on ${cfg.port}`));
