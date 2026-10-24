"""Seed rows inserted once (never overwrite later edits or deletes)."""

import sqlite3

from .sync import server_write

# (kind, alias, canonical): matching is case-insensitive on the client
SEED_ALIASES = [
    ("process", "fully washed", "Washed"),
    ("process", "wet process", "Washed"),
    ("process", "wet processed", "Washed"),
    ("process", "dry process", "Natural"),
    ("process", "dry processed", "Natural"),
    ("process", "sun dried", "Natural"),
    ("process", "sun-dried", "Natural"),
    ("process", "pulped natural", "Honey"),
    ("process", "anaerobic natural", "Anaerobic Natural"),
    ("process", "anaerobic washed", "Anaerobic Washed"),
    ("process", "carbonic", "Carbonic Maceration"),
    ("process", "wet hulled", "Wet-hulled"),
    ("process", "giling basah", "Wet-hulled"),
    ("variety", "geisha", "Gesha"),
    ("variety", "sl-28", "SL28"),
    ("variety", "sl 28", "SL28"),
    ("variety", "sl-34", "SL34"),
    ("variety", "sl 34", "SL34"),
    ("variety", "ethiopian landrace", "Heirloom"),
    ("variety", "ethiopian heirloom", "Heirloom"),
    ("variety", "landrace", "Heirloom"),
    ("origin", "columbia", "Colombia"),
    ("origin", "cote d'ivoire", "Côte d'Ivoire"),
    ("origin", "png", "Papua New Guinea"),
    ("origin", "drc", "DR Congo"),
    ("roast_level", "light roast", "Light"),
    ("roast_level", "medium roast", "Medium"),
    ("roast_level", "dark roast", "Dark"),
    ("roast_level", "filter roast", "Filter"),
    ("roast_level", "espresso roast", "Espresso"),
    ("roast_level", "omniroast", "Omni"),
    ("roast_level", "omni roast", "Omni"),
]


# The household's brewers (editable/deletable in Settings); illustration keys match web/src/lib/illustrations
SEED_BREWERS = [
    ("v60", "Hario V60 (glass)", "pour_over", "Hario V60 paper", "v60"),
    ("kadou", "Kadou", "pour_over", "Cone paper", "kadou"),
    ("switch", "Hario Switch", "switch", "Hario V60 paper", "switch"),
    ("aeropress", "AeroPress", "aeropress", "AeroPress paper", "aeropress"),
    ("dedica", "De'Longhi Dedica Arte", "espresso", None, "espresso"),
    ("siphon", "Siphon", "siphon", "Cloth", "siphon"),
]


def seed(conn: sqlite3.Connection) -> None:
    _insert_once(conn, "alias", [(f"seed:{k}:{a}", {"kind": k, "alias": a, "canonical": c}) for k, a, c in SEED_ALIASES])
    _insert_once(
        conn,
        "brewer",
        [(f"seed:{key}", {"name": n, "method": m, "filter": f, "illustration": i}) for key, n, m, f, i in SEED_BREWERS],
    )


def _insert_once(conn: sqlite3.Connection, table: str, rows: list[tuple[str, dict]]) -> None:
    for row_id, values in rows:
        if not conn.execute(f'SELECT 1 FROM "{table}" WHERE id = ?', (row_id,)).fetchone():
            server_write(conn, table, row_id, values)
