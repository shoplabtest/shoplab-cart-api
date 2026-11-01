CREATE TABLE coupons (
  code        text PRIMARY KEY,
  percent_off integer NOT NULL CHECK (percent_off BETWEEN 1 AND 100),
  expires_at  timestamptz
);
