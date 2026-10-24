"""Backups and restore.

    python -m app.backup <dest_dir> [--keep N]          snapshot the database, copy new photos and the push key
    python -m app.backup restore [snapshot] [--backups DIR]  restore a snapshot (default: the newest); app stopped

Photos never change once stored (keyed by id), so they are copied incrementally into <dest>/photos.
A restore gives the database a new epoch, which makes every device send back what it has and pull
everything again (see sync.py), so nothing written after the snapshot is lost from devices that have it.
"""

import argparse
import os
import secrets
import shutil
import sqlite3
import sys
from datetime import UTC, datetime
from pathlib import Path

VAPID_FILE = "vapid_private.pem"


def backup(db_path: Path, dest_dir: Path, keep: int, photo_dir: Path | None = None) -> Path:
    dest_dir.mkdir(parents=True, exist_ok=True)
    target = dest_dir / f"coffee-{datetime.now(UTC):%Y%m%d-%H%M%S}.db"
    _snapshot(db_path, target)
    for old in sorted(dest_dir.glob("coffee-*.db"))[:-keep]:
        old.unlink()
    data_dir = db_path.parent
    _copy_new_files(photo_dir or data_dir / "photos", dest_dir / "photos")
    if (data_dir / VAPID_FILE).is_file():
        _copy_private(data_dir / VAPID_FILE, dest_dir / VAPID_FILE)
    return target


def restore(snapshot: Path, data_dir: Path, backup_dir: Path | None = None) -> Path | None:
    """Replace data_dir/coffee.db with the snapshot. Run with the app stopped.
    Returns where the replaced database was kept (None if there was none)."""
    backup_dir = backup_dir or snapshot.parent
    _check(snapshot)
    data_dir.mkdir(parents=True, exist_ok=True)
    db_path = data_dir / "coffee.db"
    kept = None
    if db_path.exists():
        # Keep the current database (including its WAL) in case this restore was a mistake
        kept = data_dir / f"coffee.db.before-restore-{datetime.now(UTC):%Y%m%d-%H%M%S}"
        _snapshot(db_path, kept)
    for suffix in ("", "-wal", "-shm"):
        Path(f"{db_path}{suffix}").unlink(missing_ok=True)
    tmp = data_dir / "coffee.db.restoring"
    _snapshot(snapshot, tmp)
    conn = sqlite3.connect(tmp)
    try:
        epoch = secrets.randbits(62)
        conn.execute("INSERT INTO meta (key, value) VALUES ('epoch', ?) ON CONFLICT (key) DO UPDATE SET value = ?",
                     (epoch, epoch))
        conn.commit()
    finally:
        conn.close()
    tmp.replace(db_path)
    _copy_new_files(backup_dir / "photos", data_dir / "photos")
    if not (data_dir / VAPID_FILE).is_file() and (backup_dir / VAPID_FILE).is_file():
        _copy_private(backup_dir / VAPID_FILE, data_dir / VAPID_FILE)  # keeps existing push subscriptions valid
    return kept


def newest(backup_dir: Path) -> Path:
    snaps = sorted(backup_dir.glob("coffee-*.db"))
    if not snaps:
        raise SystemExit(f"no snapshots in {backup_dir}")
    return snaps[-1]


def _snapshot(src_path: Path, target: Path) -> None:
    src = sqlite3.connect(src_path)
    dst = sqlite3.connect(target)
    try:
        src.backup(dst)  # online backup API: safe while the app is writing
    finally:
        dst.close()
        src.close()


def _check(snapshot: Path) -> None:
    if not snapshot.is_file():
        raise SystemExit(f"{snapshot} does not exist")
    conn = sqlite3.connect(f"file:{snapshot}?mode=ro", uri=True)
    try:
        ok = conn.execute("PRAGMA integrity_check").fetchone()[0]
        has_meta = conn.execute("SELECT 1 FROM sqlite_master WHERE name = 'meta'").fetchone()
    except sqlite3.DatabaseError as e:
        raise SystemExit(f"{snapshot} is not a usable database: {e}") from e
    finally:
        conn.close()
    if ok != "ok" or not has_meta:
        raise SystemExit(f"{snapshot} failed its integrity check: {ok}")


def _copy_new_files(src: Path, dest: Path) -> None:
    if not src.is_dir():
        return
    dest.mkdir(parents=True, exist_ok=True)
    for f in src.iterdir():
        if f.is_file() and not f.name.endswith(".tmp") and not (dest / f.name).exists():
            tmp = dest / f"{f.name}.tmp"
            shutil.copy2(f, tmp)
            tmp.replace(dest / f.name)


def _copy_private(src: Path, dest: Path) -> None:
    shutil.copy2(src, dest)
    dest.chmod(0o600)


def main():
    data_dir = Path(os.environ.get("COFFEE_DATA_DIR", "data"))
    if sys.argv[1:2] == ["restore"]:
        p = argparse.ArgumentParser(prog="python -m app.backup restore", description="Restore a snapshot (app stopped)")
        p.add_argument("snapshot", type=Path, nargs="?", help="default: the newest in --backups")
        p.add_argument("--backups", type=Path, default=data_dir / "backups")
        args = p.parse_args(sys.argv[2:])
        snapshot = args.snapshot or newest(args.backups)
        kept = restore(snapshot, data_dir, args.backups)
        print(f"restored {snapshot}" + (f"; previous database kept as {kept}" if kept else ""))
        return
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("dest", type=Path)
    p.add_argument("--keep", type=int, default=14)
    p.add_argument("--db", type=Path, default=data_dir / "coffee.db")
    args = p.parse_args()
    print(backup(args.db, args.dest, args.keep))


if __name__ == "__main__":
    main()
