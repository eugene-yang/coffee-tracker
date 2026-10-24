-- M2: equipment, recipes and brews

CREATE TABLE grinder (
    id TEXT PRIMARY KEY,
    name TEXT,
    setting_hint TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    updated_by TEXT,
    seq        INTEGER NOT NULL
);
CREATE INDEX grinder_seq ON grinder (seq);

-- method: pour_over | switch | aeropress | espresso | siphon | other; illustration: bundled SVG key
CREATE TABLE brewer (
    id TEXT PRIMARY KEY,
    name TEXT,
    method TEXT,
    filter TEXT,
    illustration TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    updated_by TEXT,
    seq        INTEGER NOT NULL
);
CREATE INDEX brewer_seq ON brewer (seq);

-- Immutable versions: editing a recipe inserts a new row with the same root_id and version + 1
CREATE TABLE recipe (
    id TEXT PRIMARY KEY,
    root_id TEXT,
    version REAL,
    name TEXT,
    method TEXT,
    brewer_id TEXT,
    grinder_id TEXT,
    dose_g REAL,
    water_g REAL,
    yield_g REAL,
    temp_c REAL,
    time_s REAL,
    grind_setting TEXT,
    steps TEXT,
    note TEXT,
    author_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    updated_by TEXT,
    seq        INTEGER NOT NULL
);
CREATE INDEX recipe_seq ON recipe (seq);

-- Snapshot of what was actually brewed; brewer_user_id is the person, brewer_id the device
CREATE TABLE brew (
    id TEXT PRIMARY KEY,
    bag_id TEXT,
    brewer_user_id TEXT,
    method TEXT,
    brewer_id TEXT,
    grinder_id TEXT,
    grind_setting TEXT,
    dose_g REAL,
    water_g REAL,
    yield_g REAL,
    temp_c REAL,
    time_s REAL,
    steps TEXT,
    laps TEXT,
    extras TEXT,
    recipe_id TEXT,
    recipe_version REAL,
    started_from TEXT,
    brewed_at TEXT,
    note TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    updated_by TEXT,
    seq        INTEGER NOT NULL
);
CREATE INDEX brew_seq ON brew (seq);
CREATE INDEX brew_bag ON brew (bag_id);

-- Who's drinking (id = brew_id:user_id)
CREATE TABLE brew_taster (
    id TEXT PRIMARY KEY,
    brew_id TEXT,
    user_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    updated_by TEXT,
    seq        INTEGER NOT NULL
);
CREATE INDEX brew_taster_seq ON brew_taster (seq);
