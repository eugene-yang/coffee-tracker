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


def seed(conn: sqlite3.Connection) -> None:
    for kind, alias, canonical in SEED_ALIASES:
        row_id = f"seed:{kind}:{alias}"
        if not conn.execute("SELECT 1 FROM alias WHERE id = ?", (row_id,)).fetchone():
            server_write(conn, "alias", row_id, {"kind": kind, "alias": alias, "canonical": canonical})
