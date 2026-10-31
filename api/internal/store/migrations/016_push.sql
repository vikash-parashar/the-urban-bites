-- Phone push tokens (Firebase Cloud Messaging) so the app rings even when it is closed.
-- Staff tokens belong to a login; a customer's token belongs to the order they are waiting for.
CREATE TABLE IF NOT EXISTS staff_push_tokens (
    token      text PRIMARY KEY,
    user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS staff_push_tokens_user ON staff_push_tokens (user_id);

CREATE TABLE IF NOT EXISTS order_push_tokens (
    order_id   uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    token      text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (order_id, token)
);
