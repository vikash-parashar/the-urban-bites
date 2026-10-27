-- Who cancelled an order: 'customer' (allowed only before the owner sets the cooking time) or 'owner'.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_by text;
