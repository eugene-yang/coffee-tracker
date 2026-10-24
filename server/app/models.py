"""Synced table registry and API schemas."""

from dataclasses import dataclass, field
from typing import Any, Literal

from pydantic import BaseModel, Field

# Columns every synced table has; clients may never write them directly
SYSTEM_COLUMNS = frozenset({"id", "created_at", "updated_at", "deleted_at", "updated_by", "seq"})


@dataclass(frozen=True)
class SyncTable:
    name: str
    text: frozenset[str] = field(default_factory=frozenset)
    json: frozenset[str] = field(default_factory=frozenset)

    @property
    def columns(self) -> frozenset[str]:
        return self.text | self.json


SYNC_TABLES: dict[str, SyncTable] = {
    t.name: t
    for t in [
        SyncTable("user", text=frozenset({"name", "color", "avatar"})),
        SyncTable("setting", json=frozenset({"value"})),
    ]
}


class Op(BaseModel):
    op_id: str = Field(min_length=1, max_length=64)
    table: str
    id: str = Field(min_length=1, max_length=64)
    kind: Literal["upsert", "delete"]
    patch: dict[str, Any] = Field(default_factory=dict)
    client_ts: str | None = None
    by: str | None = None  # user id of whoever made the change


class PushRequest(BaseModel):
    ops: list[Op] = Field(max_length=1000)


class OpResult(BaseModel):
    op_id: str
    status: Literal["applied", "duplicate", "rejected"]
    error: str | None = None


class PushResponse(BaseModel):
    results: list[OpResult]
    server_time: str


class PullRow(BaseModel):
    table: str
    row: dict[str, Any]


class PullResponse(BaseModel):
    rows: list[PullRow]
    next: int
    has_more: bool
    server_time: str
