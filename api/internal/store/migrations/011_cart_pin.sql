-- The cart's exact pin from its Google Business listing (2026-10-27). Only moves it if nobody changed the old pin.
UPDATE shop_settings SET cart_lat = 29.115161, cart_lng = 76.416262
WHERE id = 1 AND cart_lat = 29.113493 AND cart_lng = 76.416352;
