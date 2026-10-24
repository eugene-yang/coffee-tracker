"""Bag label extraction with a local Ollama VLM (prompt and schema from tools/extract_beans.py).

The worker polls SQLite: bags still needing review get an extraction once their photos have
settled; results are written to the synced `extraction` row and never touch `coffee` directly.
"""

import asyncio
import base64
import json
import logging
import sqlite3
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path

from . import db
from .photos import paths
from .sync import server_write

log = logging.getLogger(__name__)

FIELDS = [
    "roaster",
    "coffee_name",
    "origin",
    "producer",
    "variety",
    "process",
    "roast_level",
    "altitude",
    "tasting_notes",
    "roast_date",
    "weight",
    "other_notes",
]

SCHEMA = {
    "type": "object",
    "properties": {
        k: ({"type": "array", "items": {"type": "string"}} if k == "tasting_notes" else {"type": "string"})
        for k in FIELDS
    },
    "required": FIELDS,
}

PROMPT_VERSION = "1"
PROMPT = """You are reading the label of a specialty coffee bean bag in these photos (front, back, stickers).
Extract the following fields exactly as printed on the bag. Use an empty string (or empty list) if a field is not visible. Do not guess.

- roaster: roasting company name
- coffee_name: the name of this coffee / blend
- origin: country and region
- producer: farm, estate, cooperative, washing station or producer name
- variety: coffee variety / cultivar (e.g. Geisha, SL28, Caturra, Bourbon)
- process: processing method (e.g. washed, natural, honey, anaerobic)
- roast_level: roast level or intended use (e.g. light, medium, filter, espresso, omni)
- altitude: growing altitude including units (e.g. "1900-2100 masl")
- tasting_notes: list of flavor notes listed by the roaster
- roast_date: roast date as printed
- weight: net weight as printed
- other_notes: anything else useful (harvest, lot, certifications, brewing suggestions)

Respond with JSON only."""

# images (base64 JPEG) -> extracted fields
Extractor = Callable[[list[str]], dict]


@dataclass
class ExtractionConfig:
    host: str = "http://localhost:11434"
    model: str = "qwen3.5:4b"
    timeout_s: int = 300
    settle_s: int = 10  # wait for the rest of a bag's photos before extracting
    poll_s: float = 5.0


def ollama_extractor(cfg: ExtractionConfig) -> Extractor:
    def extract(images: list[str]) -> dict:
        payload = {
            "model": cfg.model,
            "messages": [{"role": "user", "content": PROMPT, "images": images}],
            "format": SCHEMA,
            "stream": False,
            "think": False,
            "options": {"temperature": 0},
        }
        req = urllib.request.Request(
            f"{cfg.host.rstrip('/')}/api/chat",
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=cfg.timeout_s) as resp:
            body = json.load(resp)
        return json.loads(body["message"]["content"])

    return extract


def fake_extractor(images: list[str]) -> dict:
    """Fixed answer for end-to-end tests and demos (COFFEE_EXTRACTION=fake)."""
    return {
        "roaster": "Onyx Coffee Lab",
        "coffee_name": "Kii AA",
        "origin": "Kenya, Nyeri",
        "producer": "Kii Factory",
        "variety": "SL28, SL34",
        "process": "fully washed",
        "roast_level": "light roast",
        "altitude": "1700-1800 masl",
        "tasting_notes": ["Blackcurrant", "Grapefruit", "Molasses"],
        "roast_date": "03.10.2026",
        "weight": "250g",
        "other_notes": "",
    }


def enqueue_ready(conn: sqlite3.Connection, settle_s: int) -> list[str]:
    """Queue an extraction for bags needing review whose uploaded photos have settled."""
    cutoff = (datetime.now(UTC) - timedelta(seconds=settle_s)).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    rows = conn.execute(
        """
        SELECT b.id FROM bag b
        JOIN photo p ON p.bag_id = b.id AND p.deleted_at IS NULL AND p.uploaded IS NOT NULL
        LEFT JOIN extraction e ON e.id = b.id
        WHERE b.review_state = 'needs_review' AND b.deleted_at IS NULL AND e.id IS NULL
        GROUP BY b.id
        HAVING MAX(p.uploaded) <= ?
        """,
        (cutoff,),
    ).fetchall()
    queued = [r["id"] for r in rows]
    for bag_id in queued:
        server_write(conn, "extraction", bag_id, {"status": "queued", "queued_at": db.now_iso()})
    return queued


def process_next(conn: sqlite3.Connection, photo_dir: Path, extractor: Extractor, model: str) -> str | None:
    """Run one queued extraction. Returns the bag id processed, if any."""
    job = conn.execute(
        "SELECT id FROM extraction WHERE status = 'queued' AND deleted_at IS NULL ORDER BY queued_at LIMIT 1"
    ).fetchone()
    if job is None:
        return None
    bag_id = job["id"]
    server_write(conn, "extraction", bag_id, {"status": "running"})
    photo_ids = [
        r["id"]
        for r in conn.execute(
            "SELECT id FROM photo WHERE bag_id = ? AND deleted_at IS NULL AND uploaded IS NOT NULL ORDER BY position, created_at",
            (bag_id,),
        )
    ]
    base = {"model": model, "prompt_version": PROMPT_VERSION, "finished_at": None}
    try:
        if not photo_ids:
            raise RuntimeError("no uploaded photos for this bag")
        images = [base64.b64encode(paths(photo_dir, pid)["full"].read_bytes()).decode() for pid in photo_ids]
        raw = extractor(images)
        if not isinstance(raw, dict):
            raise ValueError("model did not return a JSON object")
        server_write(conn, "extraction", bag_id, base | {"status": "done", "raw": raw, "error": None, "finished_at": db.now_iso()})
    except Exception as e:  # keep the worker alive; the client can retry
        log.warning("extraction failed for bag %s: %s", bag_id, e)
        server_write(conn, "extraction", bag_id, base | {"status": "error", "error": str(e)[:500], "finished_at": db.now_iso()})
    return bag_id


async def run_worker(db_path: Path, photo_dir: Path, extractor: Extractor, cfg: ExtractionConfig) -> None:
    while True:
        try:
            await asyncio.to_thread(_tick, db_path, photo_dir, extractor, cfg)
        except Exception:
            log.exception("extraction worker tick failed")
        await asyncio.sleep(cfg.poll_s)


def _tick(db_path: Path, photo_dir: Path, extractor: Extractor, cfg: ExtractionConfig) -> None:
    conn = db.connect(db_path)
    try:
        enqueue_ready(conn, cfg.settle_s)
        while process_next(conn, photo_dir, extractor, cfg.model):
            pass
    finally:
        conn.close()
