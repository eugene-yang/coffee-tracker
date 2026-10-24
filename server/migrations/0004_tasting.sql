-- M3: tastings. Many per brew: per taster, and again as the cup cools.
-- temp_band / temp_band_suggested: hot | warm | cool (chosen vs. suggested from minutes_after_brew)
-- All scales 1–5; compass 1–5 with 3 = balanced (1 sour / weak, 5 bitter / strong)
-- tags: [{"tag": "<vocabulary id>", "source": "roaster" | "tasted"}]
CREATE TABLE tasting (
    id TEXT PRIMARY KEY,
    brew_id TEXT,
    taster_id TEXT,
    rated_at TEXT,
    minutes_after_brew REAL,
    temp_band TEXT,
    temp_band_suggested TEXT,
    overall REAL,
    aroma REAL,
    acidity REAL,
    sweetness REAL,
    body REAL,
    aftertaste REAL,
    balance REAL,
    cleanness REAL,
    compass_sour_bitter REAL,
    compass_weak_strong REAL,
    tags TEXT,
    note TEXT,
    schema_version REAL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    updated_by TEXT,
    seq        INTEGER NOT NULL
);
CREATE INDEX tasting_seq ON tasting (seq);
CREATE INDEX tasting_brew ON tasting (brew_id);
