import os

import pytest
from fastapi.testclient import TestClient

from app.main import create_app

# Tests drive the extraction worker explicitly; never call a real Ollama
os.environ["COFFEE_EXTRACTION"] = "off"


@pytest.fixture
def web_dir(tmp_path):
    web = tmp_path / "web"
    web.mkdir()
    (web / "index.html").write_text("<!doctype html><title>Coffee</title>")
    (web / "sw.js").write_text("// sw")
    return web


@pytest.fixture
def client(tmp_path, web_dir):
    with TestClient(create_app(data_dir=tmp_path / "data", web_dir=web_dir)) as c:
        # Seed rows (aliases) are written at startup; tests look at changes after them
        c.base_seq = c.get("/api/sync/pull", params={"since": 0, "limit": 2000}).json()["next"]
        yield c
