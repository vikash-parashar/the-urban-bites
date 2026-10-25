-- UPI collection: the owner's UPI ID shows on the website and app so customers can pay from any UPI app.
ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS upi_id text NOT NULL DEFAULT '';
ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS upi_name text NOT NULL DEFAULT 'The Urban Bites';
-- The UPI reference (UTR) the customer types after paying, so the owner can match it in the bank app.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_ref text;
