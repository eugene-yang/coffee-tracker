import base64
import json
import os
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient

from app import db, push
from app.main import create_app
from tests.test_sync import op, push as sync_push

NOW = datetime(2026, 10, 24, 9, 0, tzinfo=UTC)


def ago(minutes):
    return (NOW - timedelta(minutes=minutes)).isoformat(timespec="milliseconds").replace("+00:00", "Z")


class FakeSender:
    def __init__(self):
        self.sent = []
        self.gone = set()
        self.broken = set()

    def __call__(self, info, data):
        if info["endpoint"] in self.gone:
            raise push.Gone("410")
        if info["endpoint"] in self.broken:
            raise ConnectionError("no route")
        self.sent.append((info["endpoint"], json.loads(data)))


@pytest.fixture
def app_client(tmp_path, web_dir):
    sender = FakeSender()
    with TestClient(create_app(data_dir=tmp_path / "data", web_dir=web_dir, push_sender=sender)) as c:
        c.sender = sender
        c.conn = db.connect(tmp_path / "data" / "coffee.db")
        yield c
        c.conn.close()


def subscribe(client, user, endpoint=None):
    endpoint = endpoint or f"https://push.example.com/{uuid.uuid4()}"
    r = client.post("/api/push/subscribe", json={"user_id": user, "endpoint": endpoint,
                                                  "keys": {"p256dh": "BPk", "auth": "a1"}, "device_label": "iPhone"})
    assert r.status_code == 200, r.text
    return endpoint


def brew(client, brew_id, minutes_ago, brewer, coffee="Kii AA"):
    sync_push(client,
              op(table="coffee", id=f"c-{brew_id}", name=coffee),
              op(table="bag", id=f"b-{brew_id}", coffee_id=f"c-{brew_id}"),
              op(table="brew", id=brew_id, bag_id=f"b-{brew_id}", method="pour_over", brewed_at=ago(minutes_ago),
                 brewer_user_id=brewer))


def test_vapid_key_is_created_once_and_served(app_client, tmp_path):
    key = app_client.get("/api/push/vapid-key").json()["key"]
    raw = base64.urlsafe_b64decode(key + "=" * (-len(key) % 4))
    assert len(raw) == 65 and raw[0] == 4  # uncompressed P-256 point
    path = tmp_path / "data" / "vapid_private.pem"
    assert oct(path.stat().st_mode & 0o777) == "0o600"
    assert push.application_server_key(push.load_or_create_vapid(path)) == key


def test_reminds_the_brewer_once_after_the_delay(app_client):
    ana, bo = subscribe(app_client, "ana"), subscribe(app_client, "bo")
    brew(app_client, "br1", 3, "ana")
    assert push.send_due(app_client.conn, app_client.sender, NOW) == 0  # not due yet (5 min default)
    brew(app_client, "br2", 6, "ana")
    brew(app_client, "br3", 7, "bo")
    brew(app_client, "nobody", 8, None)  # saved before the device had a person
    assert push.send_due(app_client.conn, app_client.sender, NOW) == 2
    assert sorted(e for e, _ in app_client.sender.sent) == sorted([ana, bo])
    msg = app_client.sender.sent[0][1]
    assert msg["title"] == "How's the cup?" and msg["body"].startswith("Kii AA") and msg["url"] == "/"
    assert push.send_due(app_client.conn, app_client.sender, NOW) == 0  # once only


def test_skips_rated_undone_stale_and_unsubscribed(app_client):
    subscribe(app_client, "ana")
    brew(app_client, "rated", 10, "ana")
    sync_push(app_client, op(table="tasting", brew_id="rated", taster_id="ana", rated_at=ago(2), overall=4))
    brew(app_client, "undone", 10, "ana")
    sync_push(app_client, op(table="brew", id="undone", kind="delete"))
    brew(app_client, "stale", push.MAX_AGE_MIN + 5, "ana")  # arrived late from an offline device
    brew(app_client, "nobody", 10, "cy")  # cy has no subscription
    brew(app_client, "dismissed", 10, "ana")  # ana said she isn't drinking it
    sync_push(app_client, op(table="dismissal", id="dismissed:ana", brew_id="dismissed", user_id="ana"))
    assert push.send_due(app_client.conn, app_client.sender, NOW) == 0


def test_delay_is_a_synced_setting(app_client):
    subscribe(app_client, "ana")
    sync_push(app_client, op(table="setting", id=push.DELAY_SETTING, value=15))
    brew(app_client, "br", 10, "ana")
    assert push.send_due(app_client.conn, app_client.sender, NOW) == 0
    assert push.send_due(app_client.conn, app_client.sender, NOW + timedelta(minutes=6)) == 1


def test_dead_subscriptions_are_removed_and_failures_not_retried(app_client):
    gone = subscribe(app_client, "ana")
    broken = subscribe(app_client, "bo")
    app_client.sender.gone.add(gone)
    app_client.sender.broken.add(broken)
    brew(app_client, "br", 10, "ana")
    brew(app_client, "br-bo", 10, "bo")
    assert push.send_due(app_client.conn, app_client.sender, NOW) == 0
    assert app_client.conn.execute("SELECT endpoint FROM push_subscription").fetchall()[0][0] == broken
    statuses = dict(app_client.conn.execute("SELECT user_id, status FROM push_sent").fetchall())
    assert statuses == {"ana": "failed", "bo": "failed"}
    app_client.sender.broken.clear()
    assert push.send_due(app_client.conn, app_client.sender, NOW) == 0  # no retry storm


def test_resubscribing_a_device_moves_it_to_the_new_person(app_client):
    endpoint = subscribe(app_client, "ana")
    subscribe(app_client, "bo", endpoint)
    assert [r[0] for r in app_client.conn.execute("SELECT user_id FROM push_subscription")] == ["bo"]
    assert app_client.request("DELETE", "/api/push/subscribe", json={"endpoint": endpoint}).status_code == 200
    assert app_client.conn.execute("SELECT COUNT(*) FROM push_subscription").fetchone()[0] == 0


def test_test_notification(app_client):
    endpoint = subscribe(app_client, "ana")
    assert app_client.post("/api/push/test", json={"endpoint": endpoint}).status_code == 200
    assert app_client.sender.sent[-1][1]["body"] == "Notifications work on this device."
    app_client.sender.gone.add(endpoint)
    assert app_client.post("/api/push/test", json={"endpoint": endpoint}).status_code == 404
    assert app_client.post("/api/push/test", json={"endpoint": endpoint}).json()["detail"] == "not subscribed"


def test_subscribe_validates_input(app_client):
    bad = {"user_id": "ana", "endpoint": "http://insecure.example.com/x", "keys": {"p256dh": "x", "auth": "y"}}
    assert app_client.post("/api/push/subscribe", json=bad).status_code == 422


def test_real_sender_encrypts_and_signs(monkeypatch, tmp_path):
    # A browser-side key pair, as a real subscription would carry
    browser = ec.generate_private_key(ec.SECP256R1())
    p256dh = browser.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    b64 = lambda b: base64.urlsafe_b64encode(b).rstrip(b"=").decode()
    info = {"endpoint": "https://push.example.com/abc", "keys": {"p256dh": b64(p256dh), "auth": b64(os.urandom(16))}}
    captured = {}

    class Resp:
        status_code = 201
        text = ""
        headers: dict = {}

    def fake_post(url, data=None, headers=None, timeout=None, **kw):
        captured.update(url=url, data=data, headers=headers)
        return Resp()

    import requests
    monkeypatch.setattr(requests, "post", fake_post)
    monkeypatch.setattr(requests.Session, "post", lambda self, *a, **kw: fake_post(*a, **kw))
    vapid = push.load_or_create_vapid(tmp_path / "vapid.pem")
    push.make_sender(vapid, "mailto:test@example.com")(info, '{"title": "x"}')
    assert captured["url"] == info["endpoint"]
    assert captured["headers"]["content-encoding"] == "aes128gcm"
    assert captured["headers"]["authorization"].startswith("vapid t=")
    assert int(captured["headers"]["ttl"]) == push.TTL_S
    assert b'"title"' not in captured["data"]  # payload is encrypted
