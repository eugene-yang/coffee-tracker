-- M1: bean inventory. No foreign keys on synced tables: ops from different devices
-- can arrive in any order (a photo before its bag), so references are by id only.

CREATE TABLE roaster (
    id         TEXT PRIMARY KEY,
    name       TEXT,
    aliases    TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    updated_by TEXT,
    seq        INTEGER NOT NULL
);
CREATE INDEX roaster_seq ON roaster (seq);

CREATE TABLE coffee (
    id            TEXT PRIMARY KEY,
    roaster_id    TEXT,
    name          TEXT,
    origin        TEXT,
    producer      TEXT,
    variety       TEXT,
    process       TEXT,
    roast_level   TEXT,
    altitude      TEXT,
    tasting_notes TEXT,
    flavor_tags   TEXT,
    notes         TEXT,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    deleted_at    TEXT,
    updated_by    TEXT,
    seq           INTEGER NOT NULL
);
CREATE INDEX coffee_seq ON coffee (seq);

CREATE TABLE bag (
    id           TEXT PRIMARY KEY,
    coffee_id    TEXT,
    roast_date   TEXT,
    weight_g     REAL,
    price        REAL,
    purchased_at TEXT,
    review_state TEXT,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    deleted_at   TEXT,
    updated_by   TEXT,
    seq          INTEGER NOT NULL
);
CREATE INDEX bag_seq ON bag (seq);

CREATE TABLE bag_event (
    id          TEXT PRIMARY KEY,
    bag_id      TEXT,
    kind        TEXT,
    grams_delta REAL,
    at          TEXT,
    user_id     TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    deleted_at  TEXT,
    updated_by  TEXT,
    seq         INTEGER NOT NULL
);
CREATE INDEX bag_event_seq ON bag_event (seq);

CREATE TABLE photo (
    id         TEXT PRIMARY KEY,
    bag_id     TEXT,
    position   REAL,
    width      REAL,
    height     REAL,
    sha256     TEXT,
    uploaded   TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    updated_by TEXT,
    seq        INTEGER NOT NULL
);
CREATE INDEX photo_seq ON photo (seq);
CREATE INDEX photo_bag ON photo (bag_id);

-- One row per bag (id = bag id); written by the server worker, retried by clients
CREATE TABLE extraction (
    id               TEXT PRIMARY KEY,
    status           TEXT,
    model            TEXT,
    prompt_version   TEXT,
    raw              TEXT,
    error            TEXT,
    corrected_fields TEXT,
    queued_at        TEXT,
    finished_at      TEXT,
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL,
    deleted_at       TEXT,
    updated_by       TEXT,
    seq              INTEGER NOT NULL
);
CREATE INDEX extraction_seq ON extraction (seq);
CREATE INDEX extraction_status ON extraction (status);

CREATE TABLE alias (
    id         TEXT PRIMARY KEY,
    kind       TEXT,
    alias      TEXT,
    canonical  TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    updated_by TEXT,
    seq        INTEGER NOT NULL
);
CREATE INDEX alias_seq ON alias (seq);
