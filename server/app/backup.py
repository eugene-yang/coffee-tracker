"""Consistent SQLite snapshot with rotation: python -m app.backup <dest_dir> [--keep N]."""

import argparse
import os
import sqlite3
from datetime import UTC, datetime
from pathlib import Path


def backup(db_path: Path, dest_dir: Path, keep: int) -> Path:
    dest_dir.mkdir(parents=True, exist_ok=True)
    target = dest_dir / f"coffee-{datetime.now(UTC):%Y%m%d-%H%M%S}.db"
    src = sqlite3.connect(db_path)
    dst = sqlite3.connect(target)
    try:
        src.backup(dst)  # online backup API: safe while the app is writing
    finally:
        dst.close()
        src.close()
    for old in sorted(dest_dir.glob("coffee-*.db"))[:-keep]:
        old.unlink()
    return target


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("dest", type=Path)
    p.add_argument("--keep", type=int, default=14)
    p.add_argument("--db", type=Path, default=Path(os.environ.get("COFFEE_DATA_DIR", "data")) / "coffee.db")
    args = p.parse_args()
    print(backup(args.db, args.dest, args.keep))


if __name__ == "__main__":
    main()
