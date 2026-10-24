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


def _epoch(path):
    conn = db.connect(path)
    try:
        return conn.execute("SELECT value FROM meta WHERE key = 'epoch'").fetchone()[0]
    finally:
        conn.close()


def test_backup_then_restore_round_trip(tmp_path):
    from app.backup import restore
    from app.sync import write_row

    data = tmp_path / "data"
    data.mkdir()
    db_path = data / "coffee.db"
    conn = db.connect(db_path)
    db.migrate(conn)
    conn.execute("BEGIN IMMEDIATE")
    write_row(conn, "user", "u1", {"name": "Ana"}, by=None)
    conn.execute("COMMIT")
    conn.close()
    (data / "photos").mkdir()
    (data / "photos" / "p1.jpg").write_bytes(b"jpeg")
    (data / "vapid_private.pem").write_text("key")

    dest = data / "backups"
    snap = backup(db_path, dest, keep=14)
    assert (dest / "photos" / "p1.jpg").read_bytes() == b"jpeg"
    assert (dest / "vapid_private.pem").read_text() == "key"
    old_epoch = _epoch(db_path)

    # Disaster after the snapshot: new rows, then the photos and push key are lost
    conn = db.connect(db_path)
    conn.execute("BEGIN IMMEDIATE")
    write_row(conn, "user", "u2", {"name": "Bo"}, by=None)
    conn.execute("COMMIT")
    conn.close()
    (data / "photos" / "p1.jpg").unlink()
    (data / "vapid_private.pem").unlink()

    kept = restore(snap, data)
    conn = db.connect(db_path)
    names = [r[0] for r in conn.execute("SELECT name FROM user ORDER BY name")]
    conn.close()
    assert names == ["Ana"]
    assert _epoch(db_path) != old_epoch  # devices will notice and send back what they have
    assert (data / "photos" / "p1.jpg").read_bytes() == b"jpeg"
    assert (data / "vapid_private.pem").read_text() == "key"
    # the replaced database is kept, with the row written after the snapshot
    conn = db.connect(kept)
    assert [r[0] for r in conn.execute("SELECT name FROM user ORDER BY name")] == ["Ana", "Bo"]
    conn.close()


def test_restore_refuses_a_broken_snapshot(tmp_path):
    import pytest
    from app.backup import restore

    bad = tmp_path / "coffee-20260101-000000.db"
    bad.write_bytes(b"not a database at all" * 100)
    with pytest.raises(SystemExit):
        restore(bad, tmp_path / "data")
    assert not (tmp_path / "data" / "coffee.db").exists()
