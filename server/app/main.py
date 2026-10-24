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

from . import db, extraction, photos, seeds, sync
from .models import PullResponse, PushRequest, PushResponse

# Files the browser must revalidate on every load so app updates reach installed PWAs
NO_CACHE = {"index.html", "sw.js", "manifest.webmanifest", "registerSW.js"}


def create_app(
    data_dir: Path | None = None,
    web_dir: Path | None = None,
    extractor: extraction.Extractor | None = None,
    extraction_config: extraction.ExtractionConfig | None = None,
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
        task = None
        if worker_enabled:
            task = asyncio.create_task(
                extraction.run_worker(db_path, photo_dir, extractor or extraction.ollama_extractor(cfg), cfg)
            )
        yield
        if task:
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
        return PullResponse(rows=rows, next=next_cursor, has_more=has_more, server_time=db.now_iso())

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
