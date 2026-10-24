"""FastAPI app: sync API plus the built frontend."""

import os
from collections.abc import Iterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.responses import FileResponse

from . import db, sync
from .models import PullResponse, PushRequest, PushResponse

# Files the browser must revalidate on every load so app updates reach installed PWAs
NO_CACHE = {"index.html", "sw.js", "manifest.webmanifest", "registerSW.js"}


def create_app(data_dir: Path | None = None, web_dir: Path | None = None) -> FastAPI:
    data_dir = Path(data_dir or os.environ.get("COFFEE_DATA_DIR", "data")).resolve()
    web_dir = Path(web_dir or os.environ.get("COFFEE_WEB_DIR", "../web/dist")).resolve()
    db_path = data_dir / "coffee.db"

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        data_dir.mkdir(parents=True, exist_ok=True)
        conn = db.connect(db_path)
        try:
            db.migrate(conn)
        finally:
            conn.close()
        yield

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
