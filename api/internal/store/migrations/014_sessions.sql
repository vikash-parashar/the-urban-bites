-- Sign-in sessions: "sign out" ends this device's session; "sign out everywhere" ends all of them.
ALTER TABLE users ADD COLUMN IF NOT EXISTS signed_out_at timestamptz NOT NULL DEFAULT 'epoch';
CREATE TABLE IF NOT EXISTS revoked_sessions (
    jti        text PRIMARY KEY,
    expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS revoked_sessions_expires ON revoked_sessions (expires_at);
