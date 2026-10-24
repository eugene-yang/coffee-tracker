"""FastAPI app: sync API plus the built frontend."""

import asyncio
import contextlib
import os
from collections.abc import Iterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse

from . import db, extraction, photos, push, seeds, sync
from .models import PullResponse, PushRequest, PushResponse, PushSubscribeRequest, PushEndpoint

# Files the browser must revalidate on every load so app updates reach installed PWAs
NO_CACHE = {"index.html", "sw.js", "manifest.webmanifest", "registerSW.js"}


def create_app(
    data_dir: Path | None = None,
    web_dir: Path | None = None,
    extractor: extraction.Extractor | None = None,
    extraction_config: extraction.ExtractionConfig | None = None,
    push_sender: push.Sender | None = None,
) -> FastAPI:
    data_dir = Path(data_dir or os.environ.get("COFFEE_DATA_DIR", "data")).resolve()
    web_dir = Path(web_dir or os.environ.get("COFFEE_WEB_DIR", "../web/dist")).resolve()
    db_path = data_dir / "coffee.db"
    photo_dir = data_dir / "photos"
    cfg = extraction_config or extraction.ExtractionConfig(
        host=os.environ.get("OLLAMA_HOST", "http://localhost:11434"),
        model=os.environ.get("COFFEE_VLM_MODEL", "qwen3.5:4b"),
        settle_s=int(os.environ.get("COFFEE_EXTRACTION_SETTLE_S", "10")),
        poll_s=float(os.environ.get("COFFEE_EXTRACTION_POLL_S", "5")),
    )
    if not cfg.host.startswith("http"):
        cfg.host = f"http://{cfg.host}"
    # COFFEE_EXTRACTION=off disables the worker (no Ollama); =fake answers with a fixed label (tests)
    mode = os.environ.get("COFFEE_EXTRACTION", "on")
    if extractor is None and mode == "fake":
        extractor, cfg.model = extraction.fake_extractor, "fake"
    worker_enabled = extractor is not None or mode != "off"
    # COFFEE_PUSH=off stops sending reminders (subscriptions are still accepted)
    push_enabled = os.environ.get("COFFEE_PUSH", "on") != "off"
    push_subject = os.environ.get("COFFEE_PUSH_SUBJECT", "mailto:coffee@localhost")
    vapid_path = data_dir / "vapid_private.pem"
    keys: dict = {}

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        data_dir.mkdir(parents=True, exist_ok=True)
        conn = db.connect(db_path)
        try:
            db.migrate(conn)
            seeds.seed(conn)
            # A job interrupted by a restart goes back to the queue
            for row in conn.execute("SELECT id FROM extraction WHERE status = 'running'").fetchall():
                sync.server_write(conn, "extraction", row["id"], {"status": "queued"})
        finally:
            conn.close()
        keys["vapid"] = push.load_or_create_vapid(vapid_path)
        keys["sender"] = push_sender or push.make_sender(keys["vapid"], push_subject)
        tasks = []
        if worker_enabled:
            tasks.append(asyncio.create_task(
                extraction.run_worker(db_path, photo_dir, extractor or extraction.ollama_extractor(cfg), cfg)
            ))
        if push_enabled:
            tasks.append(asyncio.create_task(push.run_worker(db_path, keys["sender"])))
        yield
        for task in tasks:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task

    app = FastAPI(title="Coffee Tracker", lifespan=lifespan)

    def get_conn() -> Iterator:
        conn = db.connect(db_path)
        try:
            yield conn
        finally:
            conn.close()

    @app.get("/api/health")
    def health():
        return {"ok": True}

    @app.post("/api/sync/push", response_model=PushResponse)
    def sync_push(req: PushRequest, conn=Depends(get_conn)):
        results = sync.apply_ops(conn, req.ops)
        return PushResponse(results=results, server_time=db.now_iso())

    @app.get("/api/sync/pull", response_model=PullResponse)
    def sync_pull(since: int = Query(0, ge=0), limit: int = Query(500, ge=1, le=2000), conn=Depends(get_conn)):
        rows, next_cursor, has_more = sync.pull(conn, since, limit)
        return PullResponse(rows=rows, next=next_cursor, has_more=has_more, server_time=db.now_iso(), epoch=db.epoch(conn))

    @app.put("/api/photos/{photo_id}")
    async def upload_photo(photo_id: str, request: Request):
        data = await request.body()
        try:
            meta = await asyncio.to_thread(photos.store, photo_dir, photo_id, data)
        except photos.InvalidPhoto as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        conn = db.connect(db_path)
        try:
            sync.server_write(conn, "photo", photo_id, meta | {"uploaded": db.now_iso()})
        finally:
            conn.close()
        return {"ok": True}

    @app.get("/api/photos/{photo_id}")
    def get_photo(photo_id: str, size: Literal["thumb", "full"] = "full"):
        if not photos.ID_RE.match(photo_id):
            raise HTTPException(status_code=404)
        path = photos.paths(photo_dir, photo_id)[size]
        if not path.is_file():
            raise HTTPException(status_code=404)
        # Photo ids never change content, so caches can keep them forever
        return FileResponse(path, headers={"Cache-Control": "public, max-age=31536000, immutable"})

    @app.get("/api/push/vapid-key")
    def push_vapid_key():
        return {"key": push.application_server_key(keys["vapid"])}

    @app.post("/api/push/subscribe")
    def push_subscribe(req: PushSubscribeRequest, conn=Depends(get_conn)):
        push.subscribe(conn, req.user_id, req.endpoint, req.keys.p256dh, req.keys.auth, req.device_label)
        return {"ok": True}

    @app.delete("/api/push/subscribe")
    def push_unsubscribe(req: PushEndpoint, conn=Depends(get_conn)):
        push.unsubscribe(conn, req.endpoint)
        return {"ok": True}

    @app.post("/api/push/test")
    def push_test(req: PushEndpoint, conn=Depends(get_conn)):
        row = conn.execute("SELECT * FROM push_subscription WHERE endpoint = ?", (req.endpoint,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="not subscribed")
        data = '{"title": "Coffee Tracker", "body": "Notifications work on this device.", "url": "/settings"}'
        try:
            keys["sender"](push.subscription_info(row), data)
        except push.Gone as e:
            push.unsubscribe(conn, req.endpoint)
            raise HTTPException(status_code=404, detail="subscription expired") from e
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"push service: {e}") from e
        return {"ok": True}

    @app.get("/api/{path:path}", include_in_schema=False)
    def api_not_found(path: str):
        raise HTTPException(status_code=404)

    @app.get("/{path:path}", include_in_schema=False)
    def frontend(path: str):
        # Serve built files; anything else falls back to index.html (client-side routing)
        index = web_dir / "index.html"
        if not index.is_file():
            raise HTTPException(status_code=404, detail="frontend not built")
        target = (web_dir / path).resolve()
        if not target.is_relative_to(web_dir) or not target.is_file():
            target = index
        headers = {"Cache-Control": "no-cache"} if target.name in NO_CACHE else None
        return FileResponse(target, headers=headers)

    return app


app = create_app()
