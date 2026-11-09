-- Ad slots on the customer website. Only the admin turns them on; both start off.
-- ads_enabled: Google AdSense units (website only; the publisher and slot IDs are build settings).
-- sponsor_*: a local sponsor card the admin sells directly (website and app).
ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS ads_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS sponsor_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS sponsor_name text NOT NULL DEFAULT '';
ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS sponsor_text text NOT NULL DEFAULT '';
ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS sponsor_url text NOT NULL DEFAULT '';
