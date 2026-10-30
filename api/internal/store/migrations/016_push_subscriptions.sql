-- Web Push subscriptions: one row per staff phone/tablet/browser that turned on order alerts.
-- New orders and customer cancels are pushed to these even when the site is closed.
CREATE TABLE IF NOT EXISTS push_subscriptions (
    endpoint   text PRIMARY KEY,
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    p256dh     text NOT NULL,
    auth       text NOT NULL,
    user_agent text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user ON push_subscriptions (user_id);
