-- One-time fresh start before The Urban Bites goes live (2026-10-27): every test order and its payment
-- data goes, and only admin and owner logins stay. Menu, prices, offers and shop settings are kept.
-- Badges, Wall of Fame and Sales are computed from orders, so they start from zero.
DELETE FROM order_voice_notes;
DELETE FROM order_events;
DELETE FROM order_items;
DELETE FROM orders;
DELETE FROM users WHERE role::text NOT IN ('admin', 'owner');
ALTER SEQUENCE order_number_seq RESTART WITH 1001;
