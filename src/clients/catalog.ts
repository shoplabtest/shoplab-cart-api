import type { Config } from '../config.ts';

export interface CatalogProduct {
  id: string;
  name: string;
  price: { amount: number; currency: string };
}

export interface CatalogClient {
  /** Returns null when the product does not exist; throws on any other failure. */
  getProduct(id: string): Promise<CatalogProduct | null>;
}

export class HttpCatalogClient implements CatalogClient {
  constructor(private cfg: Pick<Config, 'catalogApiUrl'>) {}

  async getProduct(id: string) {
    const res = await fetch(`${this.cfg.catalogApiUrl}/products/${encodeURIComponent(id)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`catalog-api responded ${res.status}`);
    return (await res.json()) as CatalogProduct;
  }
}
