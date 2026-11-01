# shoplab-cart-api

Carts, coupons and price snapshots. Express + Postgres.

| Endpoint | Notes |
| --- | --- |
| `GET /cart` | user cart (Bearer JWT from iam) or guest cart named by the `x-cart-id` header |
| `POST /cart/items` | looks the product up with `GET {CATALOG_API_URL}/products/:id` and snapshots the price |
| `PATCH/DELETE /cart/items/:productId` | quantity `0` removes the line |
| `POST /cart/coupon` | percent off the subtotal; unknown or expired code is 422 |
| `POST /cart/merge` | merge a guest cart into the user's cart after login |
| `POST /cart/checkout` | login required; closes the cart and publishes `cart.checked_out` |

Consumes `product.updated` and stores the newest price as `latestUnitPrice`; the snapshot `unitPrice` never changes. Carts expire after `CART_TTL_DAYS` of inactivity.

Env: `DATABASE_URL`, `JWT_SECRET` (shared with iam), `CATALOG_API_URL`, `RABBITMQ_URL`, `PORT`, `CART_TTL_DAYS`.
`npm test` uses an in-memory store; set `TEST_DATABASE_URL` to also run migrations and the Postgres store.
`npm run seed` loads three coupons: `WELCOME10`, `SPRING25`, `EXPIRED5`.
