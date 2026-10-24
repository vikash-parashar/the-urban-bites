-- Urban Bites schema. Money is stored in whole rupees (the cart has no paise prices).

CREATE TABLE categories (
    id          text PRIMARY KEY,
    name        text NOT NULL,
    name_hi     text NOT NULL DEFAULT '',
    sort_order  int  NOT NULL DEFAULT 0
);

CREATE TABLE menu_items (
    id          text PRIMARY KEY,
    category_id text NOT NULL REFERENCES categories(id),
    name        text NOT NULL,
    name_hi     text NOT NULL DEFAULT '',
    price_full  int  CHECK (price_full >= 0),
    price_half  int  CHECK (price_half >= 0),
    image       text NOT NULL DEFAULT '',
    available   boolean NOT NULL DEFAULT true,
    sort_order  int  NOT NULL DEFAULT 0,
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TYPE order_status AS ENUM (
    'placed', 'accepted', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled'
);
CREATE TYPE fulfilment AS ENUM ('pickup', 'delivery');
CREATE TYPE payment_method AS ENUM ('cash', 'online');
CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'refunded');

CREATE SEQUENCE order_number_seq START 1001;

CREATE TABLE orders (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    number          int  NOT NULL UNIQUE DEFAULT nextval('order_number_seq'),
    track_token     text NOT NULL,
    customer_name   text NOT NULL,
    customer_phone  text NOT NULL,
    fulfilment      fulfilment NOT NULL,
    address         text,
    note            text,
    status          order_status NOT NULL DEFAULT 'placed',
    payment_method  payment_method NOT NULL,
    payment_status  payment_status NOT NULL DEFAULT 'pending',
    total           int  NOT NULL CHECK (total >= 0),
    prep_minutes    int  CHECK (prep_minutes BETWEEN 1 AND 240),
    ready_at        timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX orders_active_idx ON orders (created_at DESC)
    WHERE status NOT IN ('completed', 'cancelled');
CREATE INDEX orders_created_idx ON orders (created_at);

CREATE TABLE order_items (
    order_id    uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    line        int  NOT NULL,
    item_id     text NOT NULL REFERENCES menu_items(id),
    name        text NOT NULL,          -- snapshot, so old orders survive menu edits
    size        text NOT NULL CHECK (size IN ('full', 'half')),
    unit_price  int  NOT NULL,
    qty         int  NOT NULL CHECK (qty BETWEEN 1 AND 50),
    PRIMARY KEY (order_id, line)
);

-- Every status or timing change, so the customer sees a timeline and the owner an audit trail.
CREATE TABLE order_events (
    id          bigserial PRIMARY KEY,
    order_id    uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    status      order_status NOT NULL,
    prep_minutes int,
    at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_events_order_idx ON order_events (order_id, at);
