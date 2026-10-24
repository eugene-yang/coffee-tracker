from app import db
from app.db import MIGRATIONS_DIR
from app.backup import backup


def test_backup_snapshots_and_rotates(tmp_path):
    db_path = tmp_path / "coffee.db"
    conn = db.connect(db_path)
    db.migrate(conn)
    conn.close()
    dest = tmp_path / "backups"
    for i in range(3):
        (dest / f"coffee-2000010{i}-000000.db").parent.mkdir(exist_ok=True)
        (dest / f"coffee-2000010{i}-000000.db").write_bytes(b"")
    target = backup(db_path, dest, keep=2)
    assert sorted(p.name for p in dest.iterdir()) == ["coffee-20000102-000000.db", target.name]
    snap = db.connect(target)
    assert snap.execute("PRAGMA user_version").fetchone()[0] == len(list(MIGRATIONS_DIR.glob("*.sql")))
