-- Staff accounts. 'admin' (the developer) can do everything, including managing staff.
-- 'owner' runs the cart: orders, menu, earnings.
CREATE TABLE users (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email         text NOT NULL,
    name          text NOT NULL,
    role          text NOT NULL CHECK (role IN ('admin', 'owner')),
    password_hash text NOT NULL,
    active        boolean NOT NULL DEFAULT true,
    created_at    timestamptz NOT NULL DEFAULT now(),
    last_login_at timestamptz
);
CREATE UNIQUE INDEX users_email_idx ON users (lower(email));
