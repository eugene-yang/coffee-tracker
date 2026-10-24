-- Server-only bookkeeping
CREATE TABLE meta (
    key   TEXT PRIMARY KEY,
    value INTEGER NOT NULL
);
INSERT INTO meta (key, value) VALUES ('seq', 0);

CREATE TABLE applied_op (
    op_id      TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
);

-- Synced tables: every row carries id, timestamps, tombstone, author and seq
CREATE TABLE user (
    id         TEXT PRIMARY KEY,
    name       TEXT,
    color      TEXT,
    avatar     TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    updated_by TEXT,
    seq        INTEGER NOT NULL
);
CREATE INDEX user_seq ON user (seq);

-- id is the setting key (e.g. "temp_bands"); value is JSON
CREATE TABLE setting (
    id         TEXT PRIMARY KEY,
    value      TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    updated_by TEXT,
    seq        INTEGER NOT NULL
);
CREATE INDEX setting_seq ON setting (seq);
