-- Owner tools: cost prices for profit, menu add/delete, day-to-day expenses, and safer staff accounts.

-- Cost price of one plate (ingredients, packing). Profit = selling price - cost price.
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS cost_full int CHECK (cost_full >= 0);
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS cost_half int CHECK (cost_half >= 0);
-- A short line under the dish name, and a highlight tag: '', 'bestseller', 'new', 'spicy', 'chef'.
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS tag text NOT NULL DEFAULT '';
-- Deleting an item hides it everywhere; old orders still point at it, so the row stays.
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- The cost of each line when it was sold, so later cost changes don't rewrite past profit.
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS unit_cost int;

-- Everything else the cart spends money on: gas, rent, staff, a big vegetable purchase.
CREATE TABLE IF NOT EXISTS expenses (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    spent_on    date NOT NULL,
    category    text NOT NULL,
    amount      int  NOT NULL CHECK (amount > 0 AND amount <= 10000000),
    note        text NOT NULL DEFAULT '',
    created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS expenses_day_idx ON expenses (spent_on);

-- New staff get a temporary password and must pick their own on first sign-in.
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
-- Sign-ins issued before this time are rejected, so changing a password signs out old sessions.
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at timestamptz NOT NULL DEFAULT 'epoch';

-- "Forgot password" links. Only a hash of the token is stored; each link works once, for 30 minutes.
CREATE TABLE IF NOT EXISTS password_resets (
    token_hash  text PRIMARY KEY,
    user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at  timestamptz NOT NULL,
    used_at     timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS password_resets_user_idx ON password_resets (user_id, created_at);
