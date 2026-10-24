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
    number: frozenset[str] = field(default_factory=frozenset)
    server_only: frozenset[str] = field(default_factory=frozenset)  # written by the server, never by clients

    @property
    def columns(self) -> frozenset[str]:
        return self.text | self.json | self.number


def _t(name: str, text: str = "", json: str = "", number: str = "", server_only: str = "") -> SyncTable:
    return SyncTable(name, frozenset(text.split()), frozenset(json.split()), frozenset(number.split()),
                     frozenset(server_only.split()))


SYNC_TABLES: dict[str, SyncTable] = {
    t.name: t
    for t in [
        _t("user", text="name color avatar"),
        _t("setting", json="value"),
        _t("roaster", text="name", json="aliases"),
        _t("coffee", text="roaster_id name origin producer variety process roast_level altitude notes",
           json="tasting_notes flavor_tags"),
        _t("bag", text="coffee_id roast_date purchased_at review_state", number="weight_g price"),
        _t("bag_event", text="bag_id kind at user_id", number="grams_delta"),
        _t("photo", text="bag_id sha256 uploaded", number="position width height", server_only="uploaded"),
        _t("extraction", text="status model prompt_version error queued_at finished_at",
           json="raw corrected_fields", server_only="model prompt_version raw error finished_at"),
        _t("alias", text="kind alias canonical"),
        _t("grinder", text="name setting_hint"),
        _t("brewer", text="name method filter illustration"),
        _t("recipe", text="root_id name method brewer_id grinder_id grind_setting note author_id", json="steps",
           number="version dose_g water_g yield_g temp_c time_s"),
        _t("brew", text="bag_id brewer_user_id method brewer_id grinder_id grind_setting recipe_id started_from brewed_at note",
           json="steps laps extras", number="dose_g water_g yield_g temp_c time_s recipe_version"),
        _t("brew_taster", text="brew_id user_id"),
        _t("tasting", text="brew_id taster_id rated_at temp_band temp_band_suggested note", json="tags",
           number="minutes_after_brew overall aroma acidity sweetness body aftertaste balance cleanness "
                  "compass_sour_bitter compass_weak_strong schema_version"),
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
