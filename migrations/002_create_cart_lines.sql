CREATE TABLE cart_lines (
  cart_id      uuid NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  product_id   text NOT NULL,
  quantity     integer NOT NULL CHECK (quantity > 0),
  unit_price   integer NOT NULL CHECK (unit_price >= 0),  -- snapshot in minor units at add time
  latest_price integer,                                     -- last price seen on product.updated
  PRIMARY KEY (cart_id, product_id)
);
CREATE INDEX cart_lines_product_idx ON cart_lines (product_id);
