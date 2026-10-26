"""Web Push: VAPID keys, subscriptions and the "How's the cup?" scheduler.

Whoever brewed gets one notification per brew, `push_delay_min` (synced setting) after brewing, if
they haven't rated it yet (anyone can rate any cup; only the brewer is reminded). Brews that reach the server late (made offline) are skipped once they are
older than MAX_AGE_MIN; the in-app pending card still shows them. Re-rates never notify.
"""

import asyncio
import base64
import json
import logging
import sqlite3
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from py_vapid import Vapid

from .db import connect, now_iso

log = logging.getLogger(__name__)

DELAY_SETTING = "push_delay_min"
DEFAULT_DELAY_MIN = 5
MAX_AGE_MIN = 120
TTL_S = 30 * 60  # a notification that can't be delivered within half an hour is no longer useful


def load_or_create_vapid(path: Path) -> Vapid:
    """The server's VAPID key pair, created on first start. Losing it invalidates every subscription."""
    if path.is_file():
        return Vapid.from_file(str(path))
    path.parent.mkdir(parents=True, exist_ok=True)
    vapid = Vapid()
    vapid.generate_keys()
    tmp = path.with_suffix(".tmp")
    vapid.save_key(str(tmp))
    tmp.chmod(0o600)
    tmp.replace(path)
    return vapid


def application_server_key(vapid: Vapid) -> str:
    """Public key as the browser's pushManager.subscribe() wants it: base64url, uncompressed point."""
    raw = vapid.public_key.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


# ---- Subscriptions ---------------------------------------------------------------------------


def subscribe(conn: sqlite3.Connection, user_id: str, endpoint: str, p256dh: str, auth: str, label: str | None) -> None:
    now = now_iso()
    conn.execute(
        """INSERT INTO push_subscription (endpoint, user_id, p256dh, auth, device_label, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh,
             auth = excluded.auth, device_label = excluded.device_label, updated_at = excluded.updated_at""",
        (endpoint, user_id, p256dh, auth, label, now, now),
    )


def unsubscribe(conn: sqlite3.Connection, endpoint: str) -> None:
    conn.execute("DELETE FROM push_subscription WHERE endpoint = ?", (endpoint,))


def subscription_info(row: sqlite3.Row) -> dict:
    return {"endpoint": row["endpoint"], "keys": {"p256dh": row["p256dh"], "auth": row["auth"]}}


# ---- Scheduler -------------------------------------------------------------------------------


@dataclass
class Due:
    brew_id: str
    user_id: str
    title: str  # coffee name, for the notification body


def _iso(dt: datetime) -> str:
    return dt.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def delay_min(conn: sqlite3.Connection) -> float:
    row = conn.execute("SELECT value FROM setting WHERE id = ? AND deleted_at IS NULL", (DELAY_SETTING,)).fetchone()
    try:
        value = json.loads(row["value"]) if row and row["value"] is not None else None
    except ValueError:
        value = None
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) and value >= 0 else DEFAULT_DELAY_MIN


def due_notifications(conn: sqlite3.Connection, now: datetime) -> list[Due]:
    """Brewers with a subscription whose cup is due for a reminder: not rated by them, not reminded, not stale."""
    due_before = _iso(now - timedelta(minutes=delay_min(conn)))
    stale_before = _iso(now - timedelta(minutes=MAX_AGE_MIN))
    rows = conn.execute(
        """SELECT b.id AS brew_id, b.brewer_user_id AS user_id, c.name AS title
           FROM brew b
           LEFT JOIN bag ON bag.id = b.bag_id
           LEFT JOIN coffee c ON c.id = bag.coffee_id
           WHERE b.deleted_at IS NULL AND b.brewer_user_id IS NOT NULL
             AND b.brewed_at <= ? AND b.brewed_at >= ?
             AND EXISTS (SELECT 1 FROM push_subscription s WHERE s.user_id = b.brewer_user_id)
             AND NOT EXISTS (SELECT 1 FROM tasting t WHERE t.brew_id = b.id AND t.taster_id = b.brewer_user_id
                             AND t.deleted_at IS NULL)
             AND NOT EXISTS (SELECT 1 FROM push_sent p WHERE p.brew_id = b.id AND p.user_id = b.brewer_user_id)
             AND NOT EXISTS (SELECT 1 FROM dismissal d WHERE d.brew_id = b.id AND d.user_id = b.brewer_user_id
                             AND d.deleted_at IS NULL)
           ORDER BY b.brewed_at""",
        (due_before, stale_before),
    ).fetchall()
    return [Due(r["brew_id"], r["user_id"], r["title"] or "your cup") for r in rows]


def payload(due: Due) -> str:
    return json.dumps({
        "title": "How's the cup?",
        "body": f"{due.title} — tap to rate",
        "url": "/",
        "tag": f"tasting:{due.brew_id}:{due.user_id}",
    })


class Gone(Exception):
    """The push service says this subscription no longer exists (404 / 410)."""


# Sends one payload to one subscription; raises Gone for dead subscriptions, anything else for failures
Sender = Callable[[dict, str], None]


def make_sender(vapid: Vapid, subject: str) -> Sender:
    from pywebpush import WebPushException, webpush

    def send(info: dict, data: str) -> None:
        try:
            webpush(info, data, vapid_private_key=vapid, vapid_claims={"sub": subject}, ttl=TTL_S, timeout=10)
        except WebPushException as e:
            if e.response is not None and e.response.status_code in (404, 410):
                raise Gone(str(e)) from e
            raise

    return send


def send_due(conn: sqlite3.Connection, sender: Sender, now: datetime | None = None) -> int:
    """Send every due reminder once (to each of the person's devices). Returns how many went out."""
    sent = 0
    for due in due_notifications(conn, now or datetime.now(UTC)):
        ok = False
        data = payload(due)
        for sub in conn.execute("SELECT * FROM push_subscription WHERE user_id = ?", (due.user_id,)).fetchall():
            try:
                sender(subscription_info(sub), data)
                ok = True
            except Gone:
                unsubscribe(conn, sub["endpoint"])
            except Exception as e:  # network, push service error: no retry storm, the in-app card remains
                log.warning("push to %s failed: %s", sub["endpoint"][:60], e)
        conn.execute(
            "INSERT OR IGNORE INTO push_sent (brew_id, user_id, sent_at, status) VALUES (?, ?, ?, ?)",
            (due.brew_id, due.user_id, now_iso(), "sent" if ok else "failed"),
        )
        sent += ok
    return sent


async def run_worker(db_path: Path, sender: Sender, poll_s: float = 30) -> None:
    while True:
        try:
            conn = connect(db_path)
            try:
                await asyncio.to_thread(send_due, conn, sender)
            finally:
                conn.close()
        except Exception:
            log.exception("push worker")
        await asyncio.sleep(poll_s)
