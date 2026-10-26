-- Which ways the shop takes money. Only the admin changes these (and the UPI ID); the owner can't.
ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS accept_cash boolean NOT NULL DEFAULT true;
ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS accept_upi boolean NOT NULL DEFAULT true;
