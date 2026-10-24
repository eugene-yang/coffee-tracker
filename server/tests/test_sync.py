import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import create_app


@pytest.fixture
def client(tmp_path):
    web = tmp_path / "web"
    web.mkdir()
    (web / "index.html").write_text("<!doctype html><title>Coffee</title>")
    (web / "sw.js").write_text("// sw")
    with TestClient(create_app(data_dir=tmp_path / "data", web_dir=web)) as c:
        yield c


def op(table="user", id=None, kind="upsert", **patch):
    return {"op_id": str(uuid.uuid4()), "table": table, "id": id or str(uuid.uuid4()), "kind": kind, "patch": patch}


def push(client, *ops):
    r = client.post("/api/sync/push", json={"ops": list(ops)})
    assert r.status_code == 200, r.text
    return [res["status"] for res in r.json()["results"]]


def pull(client, since=0, limit=500):
    r = client.get("/api/sync/pull", params={"since": since, "limit": limit})
    assert r.status_code == 200, r.text
    return r.json()


def test_push_then_pull(client):
    o = op(name="Eugene", color="#c58b4e")
    assert push(client, o) == ["applied"]
    data = pull(client)
    assert [r["table"] for r in data["rows"]] == ["user"]
    row = data["rows"][0]["row"]
    assert row["id"] == o["id"] and row["name"] == "Eugene" and row["deleted_at"] is None
    assert data["next"] == row["seq"] and data["has_more"] is False


def test_retried_op_is_not_applied_twice(client):
    o = op(name="Eugene")
    assert push(client, o) == ["applied"]
    seq_after_first = pull(client)["next"]
    assert push(client, o) == ["duplicate"]
    assert pull(client)["next"] == seq_after_first


def test_patches_to_different_fields_merge(client):
    uid = str(uuid.uuid4())
    push(client, op(id=uid, name="Eugene", color="#111111"))
    push(client, op(id=uid, color="#222222"), op(id=uid, avatar="E"))
    row = pull(client)["rows"][-1]["row"]
    assert (row["name"], row["color"], row["avatar"]) == ("Eugene", "#222222", "E")


def test_same_field_last_to_sync_wins(client):
    uid = str(uuid.uuid4())
    push(client, op(id=uid, name="A"))
    push(client, op(id=uid, name="B"))
    rows = pull(client)["rows"]
    assert len(rows) == 1 and rows[0]["row"]["name"] == "B"


def test_delete_leaves_tombstone(client):
    uid = str(uuid.uuid4())
    push(client, op(id=uid, name="Ana"))
    cursor = pull(client)["next"]
    push(client, op(id=uid, kind="delete"))
    rows = pull(client, since=cursor)["rows"]
    assert len(rows) == 1 and rows[0]["row"]["deleted_at"] is not None


def test_delete_of_unknown_row_creates_tombstone(client):
    uid = str(uuid.uuid4())
    assert push(client, op(id=uid, kind="delete")) == ["applied"]
    assert pull(client)["rows"][0]["row"]["deleted_at"] is not None


def test_setting_value_roundtrips_as_json(client):
    value = {"hot_max_min": 10, "warm_max_min": 25}
    push(client, op(table="setting", id="temp_bands", value=value))
    row = pull(client)["rows"][0]["row"]
    assert row["id"] == "temp_bands" and row["value"] == value


@pytest.mark.parametrize(
    "bad",
    [
        op(table="nope", name="x"),
        op(nope="x"),
        op(seq=5),
        op(name=42),
    ],
)
def test_invalid_ops_are_rejected_without_blocking_others(client, bad):
    good = op(name="ok")
    assert push(client, bad, good) == ["rejected", "applied"]
    assert [r["row"]["name"] for r in pull(client)["rows"]] == ["ok"]


def test_pull_paginates_across_tables(client):
    for i in range(5):
        push(client, op(name=f"u{i}"))
        push(client, op(table="setting", id=f"s{i}", value=i))
    seen, cursor = [], 0
    while True:
        data = pull(client, since=cursor, limit=3)
        seen += [r["row"]["seq"] for r in data["rows"]]
        cursor = data["next"]
        if not data["has_more"]:
            break
    assert seen == sorted(seen) and len(seen) == len(set(seen)) == 10


def test_created_at_uses_client_timestamp(client):
    o = op(name="offline")
    o["client_ts"] = "2026-10-01T08:30:00.000Z"
    push(client, o)
    row = pull(client)["rows"][0]["row"]
    assert row["created_at"] == "2026-10-01T08:30:00.000Z"
    assert row["updated_at"] != row["created_at"]


def test_frontend_fallback_and_cache_headers(client):
    r = client.get("/inventory/some-bag")
    assert r.status_code == 200 and "<title>Coffee</title>" in r.text
    assert client.get("/sw.js").headers["cache-control"] == "no-cache"
    assert client.get("/../../etc/passwd").text.startswith("<!doctype html>")
    assert client.get("/api/nope").status_code == 404
