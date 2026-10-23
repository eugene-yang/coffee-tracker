# Coffee Tracker — Draft Scope

Self-hosted web app (home network only) for tracking coffee bean inventory, brews, and cup quality.
One app, two layouts: **phone** (capture & reflection) and **station** (tablet mounted at the coffee station, brewing).
The phone can do everything the station can — if the tablet is charging, the whole flow runs on the phone.
Multiple people share one inventory; each has their own tastings and preferences.

## Stack (decided)
- Backend: Python (FastAPI) + SQLite, on the home server
- Frontend: installable PWA (Add to Home Screen), offline-first; station in kiosk / standalone mode, dark theme, Wake Lock while brewing
- Extraction: local Ollama VLM (`qwen3.5:4b`, compare `gemma4:e4b`) — see `extract_beans.py`
- HTTPS on LAN: own domain (e.g. `coffee.<domain>`) → UniFi local DNS record pointing to the server's LAN IP; Caddy gets a Let's Encrypt cert via DNS-01 challenge
  - DNS is on Cloudflare: Caddy built with `caddy-dns/cloudflare` (xcaddy or prebuilt image) + scoped API token (Zone → DNS → Edit, this zone only)
  - DNS-01 only writes temporary TXT records; no public A record needed
  - Fallback if a device bypasses UniFi DNS (iCloud Private Relay, Android Private DNS / DoH): DNS-only Cloudflare A record → the LAN IP
  - Real cert, no device setup, nothing exposed to the internet
  - Required for service worker (offline), install, Wake Lock, web push on iOS
- No VPN: sync only happens on home Wi-Fi; away from home the phone works offline

## Devices & layouts
- Same feature set everywhere; layout is chosen by screen size, overridable per device in settings
- Phone layout: rate, capture bag, review, history up front; brewing one tap away
- Station layout: inventory tiles, Brew again, timer up front; ≥64px targets, no typing
- Timer is timestamp-based (stores step start times, derives elapsed) — iOS suspends PWAs on lock / app switch
- Audio cue for timer steps (unlocked by the Start tap); no vibration on iOS, so always pair with a visual cue

### Station tablet
- Treated like a cheap POS terminal: primary is an old Amazon Fire 7 reflashed with LineageOS (Android; the flashing itself is a separate project)
- Alternative: iPad mini (Guided Access for kiosk)
- LineageOS ships without a PWA-capable browser — sideload a Chromium-based one (Chrome / Cromite) for install, service worker, Wake Lock
- Kiosk: Android screen pinning, or Fully Kiosk Browser if pinning isn't enough
- Constraints drive the frontend budget: ~1 GB RAM (older generations), 1024×600 screen
  - Small bundle, no heavy framework or animation; station layout must fit a short landscape viewport
- Always-on charging on an old battery → swelling risk; consider a smart plug to cycle charging

## Users
- Shared inventory (coffees, bags, equipment, recipes); per-person brews, tastings, preferences
- No passwords (trusted LAN): profile picker; each device remembers a default user
  - Phone defaults to its owner; station shows a "who's brewing?" chip row (one tap, remembers last)
- A brew has one brewer and **zero or more tasters** — a shared carafe can be rated by everyone
  - At "Done", pick who's drinking (chips); each taster gets a pending-tasting card / push on their own phone
  - Anyone can also rate on the station by tapping their avatar first
- Anyone can brew for anyone — the brewer and the tasters are independent
- **Brew again** defaults to the current user's last brew for this bag × method, falls back to anyone's
- Push subscriptions are per user × device
- Ratings are personal scales — compare within a person, not raw scores across people
- Every device syncs all users' data (small)

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
- Equipment, added from settings (one grinder today, more later):
  - **Grinder**: name, setting format hint (numbers, clicks, `2.3.1`…)
  - **Method** — fixed list with an icon each: Pour-over, Hario Switch, AeroPress, Espresso, Siphon, Other
  - **Brewer** — the actual device, many per method (e.g. several pour-over drippers): name, method, filter as free text, optional photo of the real thing
  - Icons: no open-license set covers all five methods → small custom line-icon SVG set (inline, `currentColor`, works in dark theme); brewer photo overrides the icon when present
- **Recipe** — links to a method, optionally a specific brewer and a grinder; loosely structured to start:
  - Optional core fields: dose, water / yield, temp, grind setting (with its grinder)
  - Steps as free text or a simple list — each step may carry a time, a weight, both, or neither
  - "Freestyle" is a valid recipe: method + grinder + a note, nothing else required
  - Keep every recipe; editing creates a new version so old brews still point at what was actually used
- **Brew again** (last brew for this bag × method, incl. grind setting) as the primary action; "From recipe" as the second
- Brew deviates freely from its recipe — the brew keeps its own snapshot
- Timer: steps with times become cues; otherwise a plain stopwatch with laps; espresso "Pull another" dial-in loop
- Steppers & chips only — no typing during brew; undo instead of confirms
- Auto-decrement grams remaining by dose (derived from the brew)
- Rating, tiered — screen 1 is the < 10 s path, every tap autosaves (no submit button):
  1. **Overall 1–5** (required)
  2. **Cup temperature: Hot / Warm / Cool** — preselected from `minutes_after_brew`, one tap to override by feel
     - Thresholds are a user-editable setting (start: < 10 min Hot, 10–25 Warm, > 25 Cool)
     - Store both the suggested and chosen band → later compare against time since brew and retune thresholds
  3. Optional "More detail", each 1–5:
     - Intensity (Low → High): aroma, acidity, sweetness, body, aftertaste
     - Quality: balance (Unbalanced → Harmonious), cleanness (Muddy → Clean)
     - Liking lives in the overall score; only balance and cleanness are judgments by nature
  4. Optional compass: Sour↔Balanced↔Bitter, Weak↔Balanced↔Strong (dial-in hints)
  5. Optional flavor tags, free note
- **Multiple tastings per brew** — per taster and per temperature, to track how a cup performs as it cools ("Rate again as it cools")
- Overall score labels (shown under the stars): ★ Wouldn't finish · ★★ Off · ★★★ Good · ★★★★ Brew again · ★★★★★ Memorable
- "Pending tasting" card for recent unrated brews — a convenience only, nothing enforced; late ratings allowed, `minutes_after_brew` recorded
- Optional web push "How's the cup?" when a brew reaches the server (iOS: Home Screen app only); offline brews rely on the in-app card
- Rest windows per method (configurable), freezer in/out events → effective age

## Phase 3 — Insights & extras
- Sorted tables, best brew per bag, simple scatters (no premature "insights" — data is sparse & confounded)
- Cup performance by temperature (overall score Hot vs. Warm vs. Cool per coffee)
- Temperature threshold check: suggested vs. chosen band against `minutes_after_brew`
- Recipe comparison per coffee (which recipe / grind setting rates best)
- Per-person preferences (process / roast / origin each person rates highest); where tasters agree and disagree
- SCA flavor-wheel tags; roaster notes vs. tasted notes
- Cost per cup, re-buy / wishlist from archived coffees
- Recipe card export

## Data model (decide early)
- `Roaster → Coffee → Bag → Brew → Tasting` (re-buys link to the same Coffee)
- All entities: client-generated UUID, `created_at`, `updated_at`, `deleted_at` (tombstone)
- `Grinder`, `Brewer` (`method` enum, filter, photo), `Recipe` (versioned; `method`, optional `brewer_id` / `grinder_id`, optional core params, `steps` as text or JSON list, note, `author_id`)
- Brew stores a **snapshot** of params (+ `recipe_id` / version for provenance, null for freestyle)
- Brew params: typed core, all optional except method (brewer, dose, water/yield, time, temp, grinder + setting as string) + JSON for method-specific extras
- `User`: name, avatar/color; no credentials
- Brew: `brewer_id` (user); `BrewTaster` join (brew × user) for who's drinking → drives pending cards
- Tasting (many per brew): `schema_version`, `taster_id`, `rated_at`, `minutes_after_brew`, `temp_band` + `temp_band_suggested` (hot/warm/cool), `overall` (1–5), optional aroma / acidity / sweetness / body / aftertaste / balance / cleanness (1–5), compass, tags, note
- Storage as events (opened, frozen, thawed, finished, gram adjustments), not booleans or counters
- `updated_by` on shared entities (who edited a bag)
- Settings (synced): temperature band thresholds, rest windows per method
- Server keeps a monotonic change sequence for the pull cursor

## Out of scope (for now)
Bluetooth scales, water chemistry, social sharing, roaster databases, barcode scanning (QR → roaster URL maybe later),
native app shell / iOS Live Activities, enforced rating windows, remote sync over VPN.

## Pitfalls to watch
1. Required input per routine brew must stay < ~10 s
2. Don't build analytics before there's data
3. Never let VLM write without review; track per-field correction rate
4. Espresso ≠ filter — separate flows, shared model
5. Keep the same origin on every device and network, or local data splits
6. Sync must be idempotent (outbox retries after flaky Wi-Fi must not duplicate brews)
7. Ship capture → inventory → brew again → one-tap rating, use it a month, then re-scope
