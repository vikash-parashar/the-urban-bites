-- Delivery partners: a third staff role that only sees and delivers delivery orders.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'owner', 'delivery'));

-- Extra customer details, the shared delivery location, and who is delivering.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_email text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_city text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_lat double precision;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_lng double precision;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS rider_id uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS rider_picked_at timestamptz;

-- A short voice note for the kitchen (one per order, at most about a minute).
CREATE TABLE IF NOT EXISTS order_voice_notes (
    order_id   uuid PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
    mime       text NOT NULL,
    data       bytea NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Testing from farther away: deliver within 20 km for now (admin and owner can change it).
UPDATE shop_settings SET max_delivery_km = 20 WHERE id = 1 AND max_delivery_km < 20;
