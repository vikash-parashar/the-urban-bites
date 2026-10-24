-- Shop rules the owner can change: opening, minimum order, free delivery.
CREATE TABLE shop_settings (
    id                  int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    accepting_orders    boolean NOT NULL DEFAULT true,
    min_order_delivery  int NOT NULL DEFAULT 500 CHECK (min_order_delivery >= 0),
    min_order_pickup    int NOT NULL DEFAULT 0 CHECK (min_order_pickup >= 0),
    free_delivery_min   int NOT NULL DEFAULT 500 CHECK (free_delivery_min >= 0),
    free_delivery_km    numeric(4,1) NOT NULL DEFAULT 5 CHECK (free_delivery_km > 0),
    max_delivery_km     numeric(4,1) NOT NULL DEFAULT 5 CHECK (max_delivery_km > 0),
    delivery_fee        int NOT NULL DEFAULT 40 CHECK (delivery_fee >= 0),  -- charged when the free rule doesn't apply
    cart_lat            double precision,
    cart_lng            double precision,
    notice              text NOT NULL DEFAULT '',                           -- e.g. "Closed on Tuesday"
    updated_at          timestamptz NOT NULL DEFAULT now()
);
INSERT INTO shop_settings (id) VALUES (1);

ALTER TABLE orders
    ADD COLUMN source       text NOT NULL DEFAULT 'web' CHECK (source IN ('web', 'app', 'counter')),
    ADD COLUMN subtotal     int,
    ADD COLUMN delivery_fee int NOT NULL DEFAULT 0,
    ADD COLUMN delivery_km  numeric(5,2),
    ADD COLUMN phone_key    text;   -- last 10 digits of the phone, for badges
UPDATE orders SET subtotal = total, phone_key = right(regexp_replace(customer_phone, '\D', '', 'g'), 10);
ALTER TABLE orders ALTER COLUMN subtotal SET NOT NULL;
CREATE INDEX orders_phone_idx ON orders (phone_key) WHERE status = 'completed';

-- Counter sales may have no phone or name.
ALTER TABLE orders ALTER COLUMN customer_phone DROP NOT NULL;

-- Offers of the day / month. With item_id + offer_price, that item's full plate is charged at the offer price.
CREATE TABLE offers (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    period      text NOT NULL CHECK (period IN ('day', 'month')),
    title       text NOT NULL,
    description text NOT NULL DEFAULT '',
    item_id     text REFERENCES menu_items(id),
    offer_price int CHECK (offer_price >= 0),
    starts_on   date NOT NULL,
    ends_on     date NOT NULL CHECK (ends_on >= starts_on),
    active      boolean NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX offers_dates_idx ON offers (starts_on, ends_on) WHERE active;
