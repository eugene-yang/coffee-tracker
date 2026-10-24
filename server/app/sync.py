"""Push (apply client ops) and pull (rows changed since a cursor)."""

import json
import sqlite3
from datetime import UTC, datetime

from .db import next_seq, now_iso
from .models import SYNC_TABLES, SYSTEM_COLUMNS, Op, OpResult, PullRow, SyncTable


class OpRejected(Exception):
    pass


def apply_ops(conn: sqlite3.Connection, ops: list[Op]) -> list[OpResult]:
    """Apply ops in order inside one transaction. Already-applied op ids are skipped."""
    results = []
    conn.execute("BEGIN IMMEDIATE")
    try:
        for op in ops:
            if conn.execute("SELECT 1 FROM applied_op WHERE op_id = ?", (op.op_id,)).fetchone():
                results.append(OpResult(op_id=op.op_id, status="duplicate"))
                continue
            try:
                _apply(conn, op)
            except OpRejected as e:
                # Not recorded in applied_op: the client drops it; a retry is rejected again
                results.append(OpResult(op_id=op.op_id, status="rejected", error=str(e)))
                continue
            conn.execute("INSERT INTO applied_op (op_id, applied_at) VALUES (?, ?)", (op.op_id, now_iso()))
            results.append(OpResult(op_id=op.op_id, status="applied"))
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    return results


def _apply(conn: sqlite3.Connection, op: Op) -> None:
    table = SYNC_TABLES.get(op.table)
    if table is None:
        raise OpRejected(f"unknown table {op.table!r}")
    values = _validate_patch(table, op.patch) if op.kind == "upsert" else {}

    now = now_iso()
    seq = next_seq(conn)
    exists = conn.execute(f'SELECT 1 FROM "{table.name}" WHERE id = ?', (op.id,)).fetchone()

    if op.kind == "delete":
        values = {"deleted_at": now}
    values |= {"updated_at": now, "updated_by": op.by, "seq": seq}

    if exists:
        # Patches carry only changed fields, so edits to different fields merge
        assignments = ", ".join(f'"{col}" = ?' for col in values)
        conn.execute(f'UPDATE "{table.name}" SET {assignments} WHERE id = ?', (*values.values(), op.id))
    else:
        values |= {"id": op.id, "created_at": _created_at(op.client_ts, now)}
        cols = ", ".join(f'"{col}"' for col in values)
        marks = ", ".join("?" for _ in values)
        conn.execute(f'INSERT INTO "{table.name}" ({cols}) VALUES ({marks})', tuple(values.values()))


def _validate_patch(table: SyncTable, patch: dict) -> dict:
    values = {}
    for col, value in patch.items():
        if col in SYSTEM_COLUMNS:
            raise OpRejected(f"column {col!r} is managed by the server")
        if col in table.text:
            if value is not None and not isinstance(value, str):
                raise OpRejected(f"column {col!r} must be a string or null")
            values[col] = value
        elif col in table.json:
            values[col] = None if value is None else json.dumps(value)
        else:
            raise OpRejected(f"unknown column {col!r} for table {table.name!r}")
    return values


def _created_at(client_ts: str | None, fallback: str) -> str:
    # Rows created offline keep their real creation time
    if client_ts:
        try:
            ts = datetime.fromisoformat(client_ts.replace("Z", "+00:00"))
        except ValueError:
            return fallback
        if ts.tzinfo is not None:
            return ts.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    return fallback


def pull(conn: sqlite3.Connection, since: int, limit: int) -> tuple[list[PullRow], int, bool]:
    """Rows from all synced tables with seq > since, oldest first. Returns (rows, next cursor, has_more)."""
    found = []
    for table in SYNC_TABLES.values():
        # limit + 1 per table guarantees the global first `limit` rows are all present
        for row in conn.execute(
            f'SELECT * FROM "{table.name}" WHERE seq > ? ORDER BY seq LIMIT ?', (since, limit + 1)
        ):
            data = dict(row)
            for col in table.json:
                if data.get(col) is not None:
                    data[col] = json.loads(data[col])
            found.append(PullRow(table=table.name, row=data))
    found.sort(key=lambda r: r.row["seq"])
    rows = found[:limit]
    next_cursor = rows[-1].row["seq"] if rows else since
    return rows, next_cursor, len(found) > limit
