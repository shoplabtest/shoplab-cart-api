import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.ts';
import type { CatalogClient, CatalogProduct } from '../src/clients/catalog.ts';
import { loadConfig } from '../src/config.ts';
import { NullPublisher } from '../src/events.ts';
import type { Store } from '../src/store.ts';

export const cfg = loadConfig({ JWT_SECRET: 'test-secret', CART_TTL_DAYS: '30' } as NodeJS.ProcessEnv);

export class FakeCatalog implements CatalogClient {
  products = new Map<string, CatalogProduct>();
  down = false;
  add(id: string, amount: number, currency = 'USD') { this.products.set(id, { id, name: id, price: { amount, currency } }); }
  async getProduct(id: string) {
    if (this.down) throw new Error('down');
    return this.products.get(id) ?? null;
  }
}

export const userToken = (sub: string, role = 'customer') => jwt.sign({ sub, role, tenant: 'default' }, cfg.jwtSecret);

export function start(store: Store, catalog: CatalogClient) {
  const events = new NullPublisher();
  const server: Server = createApp({ cfg, store, events, catalog }).listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = (path: string, o: { method?: string; body?: unknown; token?: string; cartId?: string } = {}) =>
    fetch(base + path, {
      method: o.method ?? 'GET',
      headers: {
        'content-type': 'application/json',
        ...(o.token ? { authorization: `Bearer ${o.token}` } : {}),
        ...(o.cartId ? { 'x-guest-cart-id': o.cartId } : {}),
      },
      body: o.body ? JSON.stringify(o.body) : undefined,
    });
  return { server, events, call };
}
