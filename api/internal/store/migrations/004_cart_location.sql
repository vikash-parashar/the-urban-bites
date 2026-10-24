-- The cart's pin, given by the client (Google Maps 29.113493, 76.416352). The owner can still move it from the staff area.
UPDATE shop_settings SET cart_lat = 29.113493, cart_lng = 76.416352 WHERE id = 1 AND cart_lat IS NULL;
