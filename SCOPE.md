# Coffee Tracker — Draft Scope

Self-hosted web app (home network only) for tracking coffee bean inventory, brews, and cup quality.
One app, two layouts: **phone** (capture & reflection) and **station** (tablet mounted at the coffee station, brewing).
The phone can do everything the station can — if the tablet is charging, the whole flow runs on the phone.

## Stack (decided)
- Backend: Python (FastAPI) + SQLite, on the home server
- Frontend: installable PWA (Add to Home Screen), offline-first; station in kiosk / standalone mode, dark theme, Wake Lock while brewing
- Extraction: local Ollama VLM (`qwen3.5:4b`, compare `gemma4:e4b`) — see `extract_beans.py`
- HTTPS on LAN: own domain (e.g. `coffee.<domain>`) → UniFi local DNS record pointing to the server's LAN IP; Caddy gets a Let's Encrypt cert via DNS-01 challenge (needs Caddy build with the DNS provider plugin + API token)
  - Real cert, no device setup, nothing exposed to the internet
  - Required for service worker (offline), install, Wake Lock, web push on iOS
- No VPN: sync only happens on home Wi-Fi; away from home the phone works offline

## Devices & layouts
- Same feature set everywhere; layout is chosen by screen size, overridable per device in settings
- Phone layout: rate, capture bag, review, history up front; brewing one tap away
- Station layout: inventory tiles, Brew again, timer up front; ≥64px targets, no typing
- Timer is timestamp-based (stores step start times, derives elapsed) — iOS suspends PWAs on lock / app switch
- Audio cue for timer steps (unlocked by the Start tap); no vibration on iOS, so always pair with a visual cue

## Offline & sync
- Local store on each device (IndexedDB) + **outbox** of pending mutations; hand-rolled, no sync framework
- Sync when the app is open/foregrounded and the server is reachable: push outbox, then pull changes since last cursor
  - iOS has no Background Sync — data waits on the phone until the app is opened at home
- Client-generated IDs (UUIDv7) so records can be created offline
- Data is mostly append-only (brews, tastings, bag events) → no conflicts
- Editable fields (bag/coffee details): last-write-wins per field via `updated_at`
- Deletes are soft (tombstones) so they sync
- **Grams remaining is derived**, not stored: initial weight − brew doses ± manual adjustments
- Offline capabilities: browse inventory (local snapshot), brew + timer, log, rate, capture bag photos
  - Photos are queued locally; VLM extraction runs server-side after sync, review happens then
- Request persistent storage (`navigator.storage.persist()`); installed Home Screen apps are exempt from Safari's 7-day storage eviction
- One stable origin everywhere — local data is tied to the exact origin

## Phase 1 — Bean inventory (MVP)
- Snap 1–3 photos of a bag (front/back/sticker) on phone → saved immediately as *Needs review* (works offline; uploads on sync)
- VLM extraction runs in background: roaster, coffee name, origin, producer, variety, process, roast level, altitude, tasting notes, roast date, weight, other notes
- Review screen: photo side-by-side with fields; unknown = blank, never guessed; dates shown absolute + relative
- Autocomplete + aliases for roaster / process / variety / origin (Gesha = Geisha, Fully Washed = Washed)
- Store raw VLM output, model, prompt version, and which fields the user corrected
- Bag status: Resting / Open / Frozen / Finished; grams remaining (derived, manual adjust as an event)
- Inventory view (station layout primary): photo tiles with days-off-roast, rest-status color, grams left

## Phase 2 — Brew log + rating
- Equipment entities (brewers, grinders, filters); grinder setting stored with grinder id
- Recipe templates per method; **Brew again** (last recipe for this bag × method) as the primary action
- Grind setting memory per bag × method × grinder
- Optional step timer (bloom, pours); espresso "Pull another" dial-in loop
- Steppers & chips only — no typing during brew; undo instead of confirms
- Auto-decrement grams remaining by dose (derived from the brew)
- Rating, tiered — screen 1 is the < 10 s path, every tap autosaves (no submit button):
  1. **Overall 1–5** (required)
  2. **Cup temperature: Hot / Warm / Cool** — preselected from `minutes_after_brew` (default < 10 min Hot, 10–25 Warm, > 25 Cool; configurable), one tap to correct
  3. Optional "More detail": aroma, acidity, sweetness, body, aftertaste — each **intensity** 1–5 (Low → High); liking lives in the overall score only
  4. Optional compass: Sour↔Balanced↔Bitter, Weak↔Balanced↔Strong (dial-in hints)
  5. Optional flavor tags, free note
- **Multiple tastings per brew** — one per temperature, to track how a cup performs as it cools ("Rate again as it cools")
- Overall score anchors (draft): 1 wouldn't finish · 2 drinkable, clear flaws · 3 good everyday cup · 4 very good, brew it this way again · 5 memorable
- "Pending tasting" card for recent unrated brews — a convenience only, nothing enforced; late ratings allowed, `minutes_after_brew` recorded
- Optional web push "How's the cup?" when a brew reaches the server (iOS: Home Screen app only); offline brews rely on the in-app card
- Rest windows per method (configurable), freezer in/out events → effective age

## Phase 3 — Insights & extras
- Sorted tables, best brew per bag, simple scatters (no premature "insights" — data is sparse & confounded)
- Cup performance by temperature (overall score Hot vs. Warm vs. Cool per coffee)
- SCA flavor-wheel tags; roaster notes vs. tasted notes
- Cost per cup, re-buy / wishlist from archived coffees
- Recipe card export

## Data model (decide early)
- `Roaster → Coffee → Bag → Brew → Tasting` (re-buys link to the same Coffee)
- All entities: client-generated UUID, `created_at`, `updated_at`, `deleted_at` (tombstone)
- Brew stores a **snapshot** of recipe params (+ `template_id` for provenance)
- Brew params: typed core (method, dose, water/yield, time, temp, grinder+setting) + JSON for method-specific extras
- Tasting (many per brew): `schema_version`, `taster_id`, `rated_at`, `minutes_after_brew`, `temp_band` (hot/warm/cool), `overall` (1–5), optional intensities / compass / tags / note
- Storage as events (opened, frozen, thawed, finished, gram adjustments), not booleans or counters
- `user_id` on brews/tastings from day one
- Server keeps a monotonic change sequence for the pull cursor

## Out of scope (for now)
Bluetooth scales, water chemistry, social sharing, roaster databases, barcode scanning (QR → roaster URL maybe later),
native app shell / iOS Live Activities, enforced rating windows, remote sync over VPN.

## Open questions
- Exact detail attribute list (add balance / clean cup?)
- Temperature band thresholds per method (espresso cools faster than a carafe)
- Wording of the 1–5 anchors
- Tablet OS (affects kiosk setup: iPad Guided Access vs. Android screen pinning / Fully Kiosk)
- DNS provider for the DNS-01 challenge

## Pitfalls to watch
1. Required input per routine brew must stay < ~10 s
2. Don't build analytics before there's data
3. Never let VLM write without review; track per-field correction rate
4. Espresso ≠ filter — separate flows, shared model
5. Keep the same origin on every device and network, or local data splits
6. Sync must be idempotent (outbox retries after flaky Wi-Fi must not duplicate brews)
7. Ship capture → inventory → brew again → one-tap rating, use it a month, then re-scope
