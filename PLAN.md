# Coffee Tracker — Engineering Plan (draft)

Implements `SCOPE.md`. Guiding constraint: **as lightweight as possible** — few moving parts, small dependencies,
one server process, a frontend that stays fast on a ~1 GB RAM Fire 7.

## 1. Architecture

```
 Phone (iOS)         Station (Fire 7 / iPad mini)
 ┌───────────────┐   ┌───────────────┐
 │ PWA           │   │ PWA (same)    │      Service worker: app shell + photo thumbnails
 │ IndexedDB     │   │ IndexedDB     │      Local DB is the UI's source of truth
 │ outbox        │   │ outbox        │      Writes go local first, then sync
 └──────┬────────┘   └──────┬────────┘
        │ HTTPS  coffee.<domain>  (UniFi local DNS → LAN IP)
 ┌──────▼─────────────────────▼─────────────────────────────┐
 │ Home server                                               │
 │  Caddy ── TLS (Let's Encrypt, DNS-01 via Cloudflare)      │
 │    └─► FastAPI (uvicorn, 1 process)                       │
 │          ├─ /api/*        sync, photos, push subscribe    │
 │          ├─ /*            built frontend (static)         │
 │          ├─ worker task   extraction queue → Ollama       │
 │          └─ worker task   push scheduler → Web Push       │
 │        SQLite (WAL)   data/coffee.db                      │
 │        Photos         data/photos/{id}.jpg + thumbs       │
 │  Ollama (existing)    qwen3.5:4b / gemma4:e4b             │
 └───────────────────────────────────────────────────────────┘
        │ outbound only
        └─► Apple / Google push services
```

- One Python process does everything server-side; background work runs as asyncio tasks in the same process (no Celery/Redis)
- Nothing listens on the public internet; Caddy only needs outbound access to Let's Encrypt + Cloudflare API

## 2. Technology choices

| Area | Choice | Why |
|---|---|---|
| Server | Python 3.12, FastAPI, uvicorn, `uv` | Already the plan; `uv` matches `extract_beans.py` |
| DB access | stdlib `sqlite3` + Pydantic models | Few tables, custom sync logic; an ORM adds weight without much payoff |
| Migrations | Numbered `.sql` files + ~30-line runner (`PRAGMA user_version`) | No Alembic needed for SQLite at this size |
| Images | Pillow (resize, EXIF rotate, thumbnails) | Already used by the extraction script |
| Push | `pywebpush` + VAPID keys | Standard Web Push, works for iOS Home Screen apps and Android |
| Frontend | Svelte 5 + Vite (plain SPA, no SvelteKit), TypeScript | Compiles to small bundles with no runtime framework weight — matters on the Fire 7 |
| PWA | `vite-plugin-pwa` (Workbox) | Manifest + service worker with minimal config |
| Local DB | `idb` (~1 KB wrapper over IndexedDB) | Dexie is nicer but ~25 KB; the data layer is small |
| Styling | Plain CSS, custom properties, container queries | No CSS framework; dark theme via tokens |
| API types | `openapi-typescript` (dev-only) from FastAPI's OpenAPI | Shared types without a runtime cost |
| Deploy | Docker Compose: `caddy` (custom build w/ `caddy-dns/cloudflare`) + `app` | Two containers, one `compose.yml`; Ollama stays where it is |
| Backup | Nightly `sqlite3 .backup` + photo dir copy (cron / systemd timer) | Data is small; Litestream optional later |

**Frontend budget**: initial JS ≤ 100 KB gzipped, first interaction < 2 s on the Fire 7. Measured in milestone 0, checked every milestone.

## 3. Repository layout

```
server/
  pyproject.toml
  app/
    main.py            FastAPI app, static mount, startup tasks
    db.py              connection, migrations runner, seq counter
    sync.py            push / pull logic
    models.py          Pydantic schemas per table
    photos.py          upload, resize, thumbnails
    extraction.py      Ollama client (ported from extract_beans.py), job loop
    push.py            Web Push subscribe + scheduler
  migrations/0001_init.sql …
  tests/
web/
  package.json, vite.config.ts
  src/
    lib/db/            IndexedDB schema, outbox, sync client
    lib/domain/        derived values: grams / cups left, rest status, temp band
    lib/search/        normalize, alias expansion, fuzzy match, filter query object
    lib/icons/         method SVG icons (24px line)
    lib/illustrations/ brewer SVG illustrations (agent-generated at dev time) + manifest
    layouts/           PhoneShell.svelte, StationShell.svelte
    routes/            screens (see §7)
    components/        steppers, chips, stars, timer, photo tile …
deploy/
  compose.yml, Caddyfile, caddy.Dockerfile, backup.sh
tools/
  extract_beans.py     kept as the extraction eval harness
SCOPE.md, PLAN.md
```

## 4. Data model (SQLite)

Conventions for every **synced** table:
- `id TEXT PRIMARY KEY` — UUIDv7 generated on the client
- `created_at`, `updated_at`, `deleted_at` (tombstone) — ISO 8601 UTC
- `updated_by TEXT` — user id
- `seq INTEGER NOT NULL` — server-assigned from a global counter on every write; drives pull

| Table | Key columns | Notes |
|---|---|---|
| `user` | name, color, avatar | No credentials |
| `setting` | key, value (JSON) | Synced: temp band thresholds, rest windows per method, push delay |
| `roaster` | name, aliases (JSON) | |
| `coffee` | roaster_id, name, origin, producer, variety, process, roast_level, altitude, tasting_notes (JSON, raw text), flavor_tags (JSON, controlled vocabulary), notes | Re-buys share a coffee |
| `bag` | coffee_id, roast_date, weight_g, price, purchased_at, review_state (`needs_review` / `reviewed`) | Status and grams are **derived** |
| `bag_event` | bag_id, kind (`opened` `frozen` `thawed` `finished` `adjust`), grams_delta, at, user_id | Append-only |
| `photo` | bag_id, sha256, width, height, uploaded (bool) | File on disk keyed by id |
| `extraction` | bag_id, model, prompt_version, status, raw (JSON), error, corrected_fields (JSON) | Written by server worker; corrections set at review |
| `alias` | kind (`process` `variety` `origin` `roaster`), alias, canonical | Seeded (Gesha = Geisha …) |
| `grinder` | name, setting_hint | |
| `brewer` | name, method, filter, illustration? | `illustration` = key of a bundled SVG (e.g. `pour_over_cone`) | `method` ∈ `pour_over` `switch` `aeropress` `espresso` `siphon` `other` |
| `recipe` | root_id, version, name, method, brewer_id?, grinder_id?, dose_g?, water_g?, yield_g?, temp_c?, grind_setting?, steps (JSON), note, author_id | **Immutable rows**; edit = insert new version |
| `brew` | bag_id, brewer_user_id, method, brewer_id?, grinder_id?, grind_setting?, dose_g?, water_g?, yield_g?, temp_c?, time_s?, laps (JSON), extras (JSON), recipe_id?, recipe_version?, started_from (`brew_again` `recipe` `freestyle`), brewed_at, note | Snapshot of what was actually used |
| `brew_taster` | brew_id, user_id | Who's drinking → pending cards / push |
| `tasting` | brew_id, taster_id, rated_at, minutes_after_brew, temp_band, temp_band_suggested, overall, aroma, acidity, sweetness, body, aftertaste, balance, cleanness, compass_sour_bitter, compass_weak_strong, tags (JSON: `[{tag, source: roaster | tasted}]`), note, schema_version | Many per brew; all scales 1–5 |

Server-only (not synced): `applied_op` (op_id, applied_at), `push_subscription` (user_id, endpoint, keys, device_label), `push_job` (brew_id, user_id, due_at, sent_at), `meta` (seq counter).

`steps` JSON shape (loose on purpose): `[{ "label": "Bloom", "at_s": 0, "to_g": 50, "note": "" }, …]` — every field optional; free text recipes use a single `note` step.

**Derived values** (computed client-side from synced rows, never stored):
- grams left = `weight_g` − Σ `brew.dose_g` + Σ `bag_event.grams_delta`; shown as cups left = grams ÷ last dose
- bag status = latest of `opened` / `frozen` / `thawed` / `finished` (none → Resting)
- effective age = days off roast minus frozen intervals
- freshness zone (resting / peak / fading) = effective age vs. rest window of the bag's last-used method
- suggested temp band = `minutes_after_brew` vs. thresholds setting

## 5. Sync protocol

Single household, mostly append-only data → a small hand-rolled protocol.

**Client write path** — every UI write calls `mutate(table, id, patch)`:
1. Apply patch to the local IndexedDB row (UI updates immediately)
2. Append `{op_id, table, id, kind: "upsert" | "delete", patch, client_ts}` to the outbox store
3. Schedule a sync (debounced)

**Push** — `POST /api/sync/push { ops: [...] }`
- Applied in one transaction, in order
- Idempotent: an `op_id` already in `applied_op` is skipped → retries after flaky Wi-Fi never duplicate a brew
- Patches carry only changed fields → concurrent edits to *different* fields merge; same field → last to sync wins
- Each written row gets a fresh `seq`
- Response: acknowledged op ids (client deletes them from the outbox)

**Pull** — `GET /api/sync/pull?since=<seq>&limit=500`
- Returns all rows (all tables, including tombstones) with `seq > since`, plus `next` cursor and `has_more`
- Client upserts into IndexedDB, then re-applies any still-pending outbox ops on top ("rebase"), so unsynced local edits aren't overwritten
- First run = full pull (dataset is small: thousands of rows, not millions)

**Photos** — separate from row sync:
- Captured photo → resized on device (canvas, longest side ~2000 px) → blob in IndexedDB + `photo` row via outbox
- Sync uploads pending blobs first: `PUT /api/photos/{id}` (idempotent by id + sha256), then pushes ops
- Server makes thumbnails; clients fetch `/api/photos/{id}?size=thumb|full`, cached cache-first by the service worker

**When sync runs**: app open, `visibilitychange` → visible, `online` event, after local writes (debounced ~2 s), every 60 s while visible. No Background Sync (unsupported on iOS). A small status dot shows "synced / N pending / server unreachable".

**Clock skew**: `/api/sync/pull` returns server time; client stores an offset and uses it for `brewed_at` / `rated_at` (the Fire 7's clock may drift).

## 6. Server components

**Extraction worker**
- New `photo` rows for a bag with `review_state = needs_review` enqueue an `extraction` row (`status = queued`)
- Loop picks one job at a time → sends all of the bag's photos in **one** Ollama request (multiple images per message) using the prompt + JSON schema from `extract_beans.py`, versioned as `prompt_version`
- Result written to `extraction.raw`; the row syncs to clients → review screen shows suggestions next to the photos
- Review saves the coffee fields and `corrected_fields` (fields the user changed); VLM output never writes to `coffee` directly
- `tools/extract_beans.py` stays as the offline eval harness; reviewed bags become ground truth later

**Push scheduler**
- On push of a `brew` + `brew_taster` rows, create `push_job` per taster with a subscription: `due_at = brewed_at + push_delay` (setting, default 5 min)
- Loop every 30 s: send due jobs where that taster has no tasting for that brew yet; mark sent
- Brews created offline arrive late → jobs older than a couple of hours are dropped instead of sent (avoid a burst of stale notifications); the in-app pending card still shows them
- iOS: only works for the Home Screen app; prompt for permission from a button in settings (iOS requires a user gesture)

**API surface (complete list)**
- `POST /api/sync/push`, `GET /api/sync/pull`
- `PUT /api/photos/{id}`, `GET /api/photos/{id}`
- `POST /api/push/subscribe`, `DELETE /api/push/subscribe`, `GET /api/push/vapid-key`
- `GET /api/health`

No per-entity REST endpoints — all data CRUD goes through sync.

## 7. Frontend

**Screens** (7, after the UX review — `docs/UX_REVIEW.md`)
| Route | Phone | Station |
|---|---|---|
| `/` | Home: pending tastings with inline stars + temp chip → Brew again cards (max 3) → Recent | Redirects to `/inventory` |
| `/inventory` | List (80pt rows), sections, docked search, filter chips | Home: header (brewer avatar, flavor chips, More, Sort, sync dot) → ↻ Brew again shortcuts → grid → pending strip |
| `/bag/:id` | Bag detail incl. review state ("Looks right"), events, brews & ratings, coffee fields | 360px side panel over the grid: Brew again, Recipe…, Open / Freeze / Finish, ±g |
| `/capture` | Camera immediately, up to 3 shots, background save | — |
| `/brew/:id` | Pre-start (chips + params summary) → live timer → Done · drinkers (prefilled) → "Save as recipe" | Same, full screen, 160px timer |
| `/rate/:brewId` | More detail (compass, tags, note, profile, quality) | Same, opened from the stars sheet |
| `/settings` | Users, Equipment & recipes (grinders, brewers, recipes), thresholds, push, layout, sync | Users, sync, layout, thresholds (opened from the sync dot) |

**Layouts**: `StationShell` (landscape, header 56 / shortcuts 80 / grid + side panel, 72px primary targets) vs. `PhoneShell` (bottom tabs Home · Inventory · Brew · Settings). Picked by viewport (≥ 900 px wide and landscape → station) with a per-device override in local storage. Screens are shared; shells differ.

**Data layer**: Svelte stores read from IndexedDB; all writes through `mutate()`. Screens never call the network directly.

**Inventory** (most-used screen):
- Whole inventory lives in IndexedDB and in memory (hundreds of bags, not thousands) → search, filter, sort are synchronous, no network, no spinners
- Search index built in memory over roaster, name, origin + region, producer, variety, process, flavor tags, roaster notes, my notes
  - Normalize: lowercase, strip accents, expand aliases both ways; per-token prefix match, AND across tokens, edit distance 1 for tokens ≥ 5 chars
  - Rank: roaster/name prefix > other field > fuzzy; the matched field fills the tile's reserved line
  - Runs on every keystroke, no debounce
- Filters + sort + search are one query object `{text, families, process, origin, roaster, roast_level, state, min_rating, sort}` → reused by Phase 4
- Rendering on the Fire 7:
  - Thumbnails pre-generated server-side (240px WebP, ~10 KB), cached cache-first by the service worker; the station never caches full-size photos
  - `loading=lazy decoding=async`, fixed aspect ratio, `content-visibility:auto` + `contain-intrinsic-size` on tiles
  - Tiles are keyed and stay mounted; filtering toggles `hidden` instead of re-rendering
  - Derived values and sort keys recomputed only after a sync batch or local write, not per render
  - No shadows, blur or transitions

**Timer**: state is start timestamps + laps persisted in IndexedDB → survives lock, reload, app switch. Wake Lock while `/brew/:id` is open, re-acquired on `visibilitychange`. Audio cue via a pre-unlocked `AudioContext` (Start tap) + visual flash.

**Current user**: per-device default stored locally; station shows a sticky brewer avatar in the header (remembers last). Drinkers at Done are prefilled from this brewer's last brew.

**Station behaviors**: idle after 2 min → dim clock + brewer avatar + pending count; first tap only wakes. Wake Lock during a brew and 10 min after Done. Taps only, double taps within 300 ms ignored, undo toasts (5 s) instead of confirms. Sync dot in the header, never a blocking modal (except storage full).

**Method icons**: no open-license icon set covers all five methods (searched; available sets are paid or per-icon licensed). Plan: a custom 24×24 single-stroke SVG set — pour-over cone, Switch (cone on base with valve), AeroPress (chamber + plunger), espresso (portafilter), siphon (two globes on stand), plus a generic cup for Other — inline, `stroke="currentColor"`, ~1 KB each.

**Brewer illustrations** (generated by an agent during development, not at runtime):
- One SVG per brewer owned today (reference photos in `docs/reference/brewers/`):
  | Key | Brewer | Recognizable features to keep |
  |---|---|---|
  | `v60` | Hario V60, glass | Clear glass 60° cone (light tint + highlight to read as glass), spiral ribs, single large hole, loop handle, round base plate |
  | `kadou` | Kadou ceramic dripper | Celadon-green glaze, steep cone with vertical fluted ribs inside the rim, angular open handle, wide flat saucer base (embossed カドウ omitted — no text in illustrations) |
  | `switch` | Hario Switch | Glass cone on a round base with the switch/ball-valve lever |
  | `aeropress` | AeroPress | Chamber + plunger, hex-edged filter cap |
  | `espresso` | De'Longhi Dedica Arte (EC885.M) | Very slim, tall stainless body, buttons at the top front, portafilter with handle, steam wand on the side, drip tray |
  | `siphon` | Siphon | Two glass globes on a stand, burner below |
- Each manifest entry carries a **signature color** (e.g. Kadou celadon) used as the accent fill, so brewers are recognizable at a glance; outlines and shading still come from theme variables
- House style defined once and written into `lib/illustrations/STYLE.md` so later additions match: flat shapes, 2–3 fills from CSS variables (`--ill-fg`, `--ill-accent`, `--ill-bg`), no gradients or text, 256×256 viewBox, ≤ 6 KB each
- `manifest.json` maps keys → method + display name; settings shows them as a picker per brewer
- Review loop: render all illustrations side by side in light and dark themes (a dev-only gallery page / Playwright screenshot), adjust, commit

## 8. Milestones

Each milestone ends with something used on real devices. Sizes are relative (S/M/L).

**M0 — Foundations (M)**
- Repo layout, Compose, Caddy with DNS-01 via Cloudflare, UniFi local DNS record
- FastAPI skeleton, migrations runner, `user` + `setting` tables, full sync push/pull for those two
- PWA shell installable on iPhone and the Fire 7 (or iPad mini until the Fire 7 is flashed); works offline
- Measure bundle size and first load on the slowest device
- Exit: create a user offline on the phone, see it on the tablet after sync

**M1 — Inventory (L)**
- Capture → photo blobs → upload → extraction worker → review inside bag detail → inventory
- Roaster / coffee / bag / bag_event / photo / extraction / alias tables; derived grams / cups + freshness
- Inventory browsing in full: sections, sort, search (normalize, aliases, fuzzy), filter chips + More sheet, phone list + station grid, side panel
- Controlled flavor vocabulary (families → tags) seeded
- Exit: add every bag currently on the shelf through the app

**M2 — Brewing (L)**
- Settings → Equipment & recipes: grinders, brewers (method icons + brewer illustration picker), recipes (versioned in data, loose steps)
- Generate the icon set and brewer illustrations; review in the dev gallery
- Brew from a bag: Brew again / Recipe… / freestyle, pre-start screen, timer, espresso preset, Done · drinkers (prefilled), Save as recipe; grams auto-decrement
- Station shell: brewer avatar, ↻ shortcuts, idle screen, wake lock, sync dot
- Exit: log every brew for a week from both phone and station

**M3 — Rating (M)**
- Inline stars + temp chip on pending cards (phone home, station pending strip + stars sheet)
- Full More detail: compass, tags (roaster-notes confirm chips), note, profile and quality scales (1–5, words at 1 / 3 / 5)
- Rate again as it cools (band change brings the card back; 5-min edit window)
- Exit: every brew gets at least an overall rating from each drinker

**M4 — Push + hardening (M)**
- Web Push subscribe + scheduler; backups + restore test; sync edge cases (long offline, many photos)
- Exit: a week with no sync bugs; restore from backup verified

**Then**: use it for a month (scope pitfall #7), re-scope, then Phase 3 insights and Phase 4 recommendations.

**Recommendations (later)**: start as a server-side scoring function over the person's tastings (flavor tags, process, origin vs. overall score) → rank in-stock bags and their best recipe; consider the local LLM only for turning a free-text request ("something fruity") into tags. Requires: controlled flavor vocabulary and alias normalization from M1 (already in the plan).

## 9. Testing

- **Server (pytest)**: sync idempotency (same ops twice), field-level merge, tombstones, pull pagination, derived-value fixtures, extraction with a stubbed Ollama
- **Client (Vitest)**: outbox + rebase, derived values (grams, cups, freshness, temp band), mutate → op shape, search (accents, aliases, typos, ranking)
- **E2E (Playwright, Chromium already installed in dev env)**: offline flow — `context.setOffline(true)`, brew + rate, go online, assert server state; two browser contexts as phone + station
- **Device checklist per milestone**: install, offline launch, wake lock, timer through screen lock, photo capture (iPhone + Android)

## 10. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Fire 7 too slow | Budget from M0; iPad mini as fallback; keep screens simple |
| iOS evicts local data | Home Screen install + `navigator.storage.persist()`; server is the real copy after every sync |
| Sync bugs lose data | Idempotent ops, outbox never deleted until acked, server tests first, nightly backups |
| VLM slow on the server | Queue is async; bag is usable before extraction finishes |
| Generated illustrations look inconsistent | One written style guide + side-by-side gallery review; regenerate outliers |
| Device bypasses UniFi DNS | DNS-only Cloudflare record pointing to the LAN IP |
| Scope creep into insights | Phase 3 only after a month of real data |

## 11. Open questions for the plan

- Illustration house style: review 2–3 directions in the gallery before generating the full set

Decided: Svelte 5; Docker Compose for deploy; method icons drawn in-house (M2); brewer pictures are agent-generated SVG illustrations at dev time (M2), runtime photo restyling deferred; UX review folded in (`docs/UX_REVIEW.md`), with these deviations from it: all detail scales stay 1–5 (words at 1 / 3 / 5) and ship in M3; no `temp_band_touched`; brewer images kept.
