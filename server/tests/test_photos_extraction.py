import io
import uuid

from PIL import Image

from app import db, extraction
from app.extraction import enqueue_ready, process_next


def jpeg(w=1200, h=800, color=(180, 120, 60)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (w, h), color).save(buf, "JPEG")
    return buf.getvalue()


def push(client, *ops):
    r = client.post("/api/sync/push", json={"ops": list(ops)})
    assert r.status_code == 200, r.text
    return r.json()["results"]


def op(table, id, **patch):
    return {"op_id": str(uuid.uuid4()), "table": table, "id": id, "kind": "upsert", "patch": patch}


def rows(client, table):
    data = client.get("/api/sync/pull", params={"since": client.base_seq, "limit": 2000}).json()
    return {r["row"]["id"]: r["row"] for r in data["rows"] if r["table"] == table}


def new_bag_with_photos(client, n=2):
    bag = str(uuid.uuid4())
    push(client, op("bag", bag, review_state="needs_review"))
    photo_ids = []
    for i in range(n):
        pid = str(uuid.uuid4())
        assert client.put(f"/api/photos/{pid}", content=jpeg()).status_code == 200
        push(client, op("photo", pid, bag_id=bag, position=i))
        photo_ids.append(pid)
    return bag, photo_ids


def test_upload_makes_thumb_and_full(client):
    pid = str(uuid.uuid4())
    assert client.put(f"/api/photos/{pid}", content=jpeg(3000, 2000)).status_code == 200
    thumb = Image.open(io.BytesIO(client.get(f"/api/photos/{pid}?size=thumb").content))
    full = client.get(f"/api/photos/{pid}")
    assert thumb.size == (240, 240) and thumb.format == "WEBP"
    assert Image.open(io.BytesIO(full.content)).size == (2000, 1333)
    assert "immutable" in full.headers["cache-control"]
    row = rows(client, "photo")[pid]
    assert row["uploaded"] and row["width"] == 2000 and len(row["sha256"]) == 64


def test_upload_is_idempotent_and_merges_with_client_row(client):
    pid = str(uuid.uuid4())
    push(client, op("photo", pid, bag_id="b1", position=0))  # row arrives before the file
    client.put(f"/api/photos/{pid}", content=jpeg())
    client.put(f"/api/photos/{pid}", content=jpeg())  # retried upload
    row = rows(client, "photo")[pid]
    assert row["bag_id"] == "b1" and row["uploaded"]


def test_bad_uploads_are_rejected(client):
    assert client.put(f"/api/photos/{uuid.uuid4()}", content=b"not an image").status_code == 400
    assert client.put("/api/photos/../../etc", content=jpeg()).status_code in (400, 404, 405)
    assert client.get(f"/api/photos/{uuid.uuid4()}").status_code == 404


def test_extraction_waits_for_photos_to_settle_then_runs(client, tmp_path):
    bag, photo_ids = new_bag_with_photos(client, n=2)
    data_dir = tmp_path / "data"
    conn = db.connect(data_dir / "coffee.db")
    assert enqueue_ready(conn, settle_s=60) == []  # photos just uploaded
    assert enqueue_ready(conn, settle_s=0) == [bag]
    assert enqueue_ready(conn, settle_s=0) == []  # only once per bag

    seen = {}

    def fake_extractor(images):
        seen["n"] = len(images)
        return {"roaster": "Onyx", "coffee_name": "Kii AA", "tasting_notes": ["blackcurrant"]}

    assert process_next(conn, data_dir / "photos", fake_extractor, "test-model") == bag
    assert process_next(conn, data_dir / "photos", fake_extractor, "test-model") is None
    ex = rows(client, "extraction")[bag]
    assert seen["n"] == 2
    assert ex["status"] == "done" and ex["raw"]["roaster"] == "Onyx"
    assert ex["model"] == "test-model" and ex["prompt_version"] == extraction.PROMPT_VERSION


def test_extraction_error_is_recorded_and_client_can_retry(client, tmp_path):
    bag, _ = new_bag_with_photos(client, n=1)
    data_dir = tmp_path / "data"
    conn = db.connect(data_dir / "coffee.db")
    enqueue_ready(conn, settle_s=0)

    def broken(images):
        raise ConnectionError("Ollama unreachable")

    process_next(conn, data_dir / "photos", broken, "m")
    assert rows(client, "extraction")[bag]["status"] == "error"
    assert "unreachable" in rows(client, "extraction")[bag]["error"]

    push(client, op("extraction", bag, status="queued"))
    process_next(conn, data_dir / "photos", lambda imgs: {"roaster": "X"}, "m")
    assert rows(client, "extraction")[bag]["status"] == "done"


def test_reviewed_bags_are_not_extracted(client, tmp_path):
    bag, _ = new_bag_with_photos(client, n=1)
    push(client, op("bag", bag, review_state="reviewed"))
    conn = db.connect(tmp_path / "data" / "coffee.db")
    assert enqueue_ready(conn, settle_s=0) == []
