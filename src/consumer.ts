import amqp from 'amqplib';
import { EXCHANGE, type ProductUpdated } from './events.ts';
import type { Store } from './store.ts';

export const QUEUE = 'cart-api.product-updated';

/** Records the newest catalog price on matching lines. The snapshot price (`unit_price`) is never changed. */
export async function handleProductUpdated(store: Store, ev: ProductUpdated): Promise<number> {
  if (typeof ev.productId !== 'string' || !Number.isInteger(ev.price)) return 0;
  return store.recordLatestPrice(ev.productId, ev.price);
}

export async function startConsumer(url: string, store: Store) {
  const conn = await amqp.connect(url);
  const ch = await conn.createChannel();
  await ch.assertExchange(EXCHANGE, 'topic', { durable: true });
  await ch.assertQueue(QUEUE, { durable: true });
  await ch.bindQueue(QUEUE, EXCHANGE, 'product.updated');
  await ch.consume(QUEUE, async (msg) => {
    if (!msg) return;
    try {
      await handleProductUpdated(store, JSON.parse(msg.content.toString()) as ProductUpdated);
      ch.ack(msg);
    } catch {
      ch.nack(msg, false, false);
    }
  });
  return async () => { await ch.close(); await conn.close(); };
}
