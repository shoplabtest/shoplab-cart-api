CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE carts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid,
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'checked_out')),
  coupon_code text,
  currency    text,
  expires_at  timestamptz NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
-- One active cart per user.
CREATE UNIQUE INDEX carts_one_active_per_user ON carts (user_id) WHERE user_id IS NOT NULL AND status = 'active';
