-- Fresh start for the shop: removes every order and its payment data, keeps everything else.
-- Kept: users (staff logins, owner, riders), menu, prices, offers, shop settings, UPI ID, cart location.
-- Removed: orders, order items, order history, kitchen voice notes, payment status/UTRs (they live on orders).
-- Badges, Wall of Fame and the Sales dashboard are worked out from orders, so they start from zero too.
-- Order numbers start again at 1001.
--
-- Run:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/db/fresh-start.sql
-- Add -v with_expenses=1 to also clear the Expenses list (test expenses).

\if :{?with_expenses}
\else
  \set with_expenses 0
\endif

\echo 'Before:'
SELECT (SELECT count(*) FROM orders) AS orders,
       (SELECT count(*) FROM order_items) AS order_items,
       (SELECT count(*) FROM expenses) AS expenses,
       (SELECT count(*) FROM users) AS users;

BEGIN;
DELETE FROM order_voice_notes;
DELETE FROM order_events;
DELETE FROM order_items;
DELETE FROM orders;
SELECT :with_expenses = 1 AS clear_expenses \gset
\if :clear_expenses
  DELETE FROM expenses;
\endif
ALTER SEQUENCE order_number_seq RESTART WITH 1001;
COMMIT;

\echo 'After:'
SELECT (SELECT count(*) FROM orders) AS orders,
       (SELECT count(*) FROM order_items) AS order_items,
       (SELECT count(*) FROM expenses) AS expenses,
       (SELECT count(*) FROM users) AS users;
