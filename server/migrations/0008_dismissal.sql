-- "Not drinking this one": a person dismissed a recent cup from their pending tastings.
-- They can still rate it later from the bag or Tastings; the brewer isn't reminded about a dismissed cup.
CREATE TABLE dismissal (
    id TEXT PRIMARY KEY,
    brew_id TEXT,
    user_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    updated_by TEXT,
    seq        INTEGER NOT NULL
);
CREATE INDEX dismissal_seq ON dismissal (seq);
