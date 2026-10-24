"""SQLite connection, migrations runner and the global change sequence."""

import sqlite3
from datetime import UTC, datetime
from pathlib import Path

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"


def connect(path: Path) -> sqlite3.Connection:
    # One connection per request; WAL lets readers run alongside the single writer.
    # FastAPI may open and close a request's connection on different threadpool threads
    # (it's never used concurrently), so the same-thread check has to be off.
    conn = sqlite3.connect(path, isolation_level=None, timeout=10, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 10000")
    return conn


def migrate(conn: sqlite3.Connection, migrations_dir: Path = MIGRATIONS_DIR) -> int:
    """Apply numbered .sql files newer than PRAGMA user_version. Returns the new version."""
    current = conn.execute("PRAGMA user_version").fetchone()[0]
    for path in sorted(migrations_dir.glob("*.sql")):
        version = int(path.name.split("_", 1)[0])
        if version <= current:
            continue
        conn.execute("BEGIN IMMEDIATE")
        try:
            for statement in _split_sql(path.read_text()):
                conn.execute(statement)
            conn.execute(f"PRAGMA user_version = {version}")
            conn.execute("COMMIT")
        except Exception:
            conn.execute("ROLLBACK")
            raise
        current = version
    return current


def _split_sql(script: str) -> list[str]:
    # executescript() would commit our transaction, so split statements ourselves
    statements, buf = [], []
    for line in script.splitlines():
        if line.strip().startswith("--"):
            continue
        buf.append(line)
        if sqlite3.complete_statement("\n".join(buf)):
            statement = "\n".join(buf).strip()
            if statement:
                statements.append(statement)
            buf = []
    return statements


def next_seq(conn: sqlite3.Connection) -> int:
    """Next value of the global change counter; call inside the write transaction."""
    return conn.execute("UPDATE meta SET value = value + 1 WHERE key = 'seq' RETURNING value").fetchone()[0]


def now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")
