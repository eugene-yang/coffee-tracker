import uuid

import pytest


def op(table="user", id=None, kind="upsert", **patch):
    return {"op_id": str(uuid.uuid4()), "table": table, "id": id or str(uuid.uuid4()), "kind": kind, "patch": patch}


def push(client, *ops):
    r = client.post("/api/sync/push", json={"ops": list(ops)})
    assert r.status_code == 200, r.text
    return [res["status"] for res in r.json()["results"]]


def pull(client, since=None, limit=500):
    since = client.base_seq if since is None else since
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
    seen, cursor = [], client.base_seq
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


def test_number_columns_and_server_only_columns(client):
    bag = str(uuid.uuid4())
    assert push(client, op(table="bag", id=bag, weight_g=250, review_state="needs_review")) == ["applied"]
    assert push(client, op(table="bag", id=bag, weight_g="250")) == ["rejected"]
    assert push(client, op(table="photo", uploaded="2026-01-01")) == ["rejected"]
    assert pull(client)["rows"][0]["row"]["weight_g"] == 250


def test_seed_aliases_are_synced(client):
    rows = pull(client, since=0, limit=2000)["rows"]
    aliases = {(r["row"]["kind"], r["row"]["alias"]): r["row"]["canonical"] for r in rows if r["table"] == "alias"}
    assert aliases[("variety", "geisha")] == "Gesha"
    assert aliases[("process", "fully washed")] == "Washed"


def test_brew_tables_roundtrip(client):
    brew = str(uuid.uuid4())
    results = push(
        client,
        op(table="brew", id=brew, bag_id="b1", brewer_user_id="u1", method="pour_over", dose_g=15, water_g=250,
           steps=[{"label": "Bloom", "at_s": 0, "to_g": 45}], laps=[32.5], started_from="brew_again"),
        op(table="brew_taster", id=f"{brew}:u1", brew_id=brew, user_id="u1"),
        op(table="recipe", id="r1", root_id="r1", version=1, name="Daily V60", method="pour_over", steps=[]),
    )
    assert results == ["applied", "applied", "applied"]
    rows = {r["table"]: r["row"] for r in pull(client)["rows"]}
    assert rows["brew"]["steps"][0]["label"] == "Bloom" and rows["brew"]["dose_g"] == 15
    assert rows["recipe"]["version"] == 1


def test_owned_brewers_are_seeded_once(client):
    rows = [r["row"] for r in pull(client, since=0, limit=2000)["rows"] if r["table"] == "brewer"]
    assert {r["illustration"] for r in rows} == {"v60", "kadou", "switch", "aeropress", "espresso", "siphon"}
    # a deleted seed brewer stays deleted
    push(client, op(table="brewer", id="seed:siphon", kind="delete"))
