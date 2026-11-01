export interface Config {
  port: number;
  databaseUrl: string;
  rabbitUrl: string | undefined;
  jwtSecret: string;
  catalogApiUrl: string;
  cartTtlDays: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: Number(env.PORT ?? 3003),
    databaseUrl: env.DATABASE_URL ?? 'postgres://cart:cart@localhost:5432/cart',
    rabbitUrl: env.RABBITMQ_URL,
    jwtSecret: env.JWT_SECRET ?? 'dev-only-secret',
    catalogApiUrl: env.CATALOG_URL ?? 'http://localhost:3002',
    cartTtlDays: Number(env.CART_TTL_DAYS ?? 30),
  };
}
