-- M4: web push (server-only, not synced)

-- One row per browser subscription; a device that switches person keeps its endpoint
CREATE TABLE push_subscription (
    endpoint     TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL,
    p256dh       TEXT NOT NULL,
    auth         TEXT NOT NULL,
    device_label TEXT,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
);
CREATE INDEX push_subscription_user ON push_subscription (user_id);

-- "How's the cup?" goes out once per brew x drinker (status: sent | failed)
CREATE TABLE push_sent (
    brew_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    sent_at TEXT NOT NULL,
    status  TEXT NOT NULL,
    PRIMARY KEY (brew_id, user_id)
);
