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
- The phone can do everything; the station leaves out phone-only tasks (capture, review, history) to stay simple
- Layout is chosen by screen size, overridable per device in settings
- Phone layout: bottom tabs Home · Inventory · Tastings · Settings (no Brew tab: brews start from a bag or Brew again; a "Brew in progress" banner leads back to a running timer)
  - Home = pending tastings (inline stars) → Brew again cards (max 3) → Recent
  - Tastings = every rating, newest first, with one compact set of dropdowns: rated by (me by default · all · one person), brewed by, brewer, grinder
  - Bag page = Brew again on top → state and amount → the bag's brews with their ratings → details, with Edit (and label review) as a separate step
- Station layout: home **is** the inventory; brews start from a bag; taps only, no typing
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
- POS rules:
  - Targets: 72px primary, ≥ 56px secondary, 12px gaps, 16px dead zone at the bezels
  - Readable at 1–1.5 m: timer 160px, step label 40px, tile titles 18px, body ≥ 16px
  - Wet hands: taps only (no swipe / long-press / drag), ignore double taps within 300 ms, undo toasts instead of confirms, Done and Reset at opposite ends
  - Max three bands in 1024×600 landscape (header 56 / Brew again shortcuts 80 / grid) + a 360px side panel for detail; Fully Kiosk immersive mode
  - Dark theme `#121212` background (LCD, not OLED), `#EDEDED` text, status colors always paired with an icon / word
  - Idle after 2 min → dim clock, last brewer's avatar, pending-tasting count, "Tap to start"; the first tap only wakes (no accidental brews)
  - Wake Lock during a live brew and 10 min after Done
  - Sync status as a header dot: green (synced), amber + count (pending), crossed cloud "Saved on this tablet" (offline); never blocks the screen

## Users
- Shared inventory (coffees, bags, equipment, recipes); per-person brews, tastings, preferences
- No passwords (trusted LAN): profile picker; each device remembers a default user
- Each person has a color and, optionally, an emoji avatar (picked from a grid of long-supported emoji, or typed on a phone); without one, the avatar shows their initial
  - Phone defaults to its owner
  - Station: **who's brewing** is a sticky avatar in the header (keeps the last brewer; tap to switch, +2 taps), shown large on the idle screen so a wrong attribution is obvious; editable on the brew afterwards
- A brew has one brewer; **anyone can rate any cup** — no "who's drinking" step, so one brew can collect ratings from several people
  - Every recent cup is on each person's pending list; the push reminder goes to the brewer only
  - On the station, each recent cup shows everyone's avatar (with their latest stars) in the pending strip; tap one → stars sheet with that person's name at 32px, closes 1.5 s after a tap, with undo
- No brewing or rating until the device has a person (phone: Settings; station: Who's brewing)
- **Brew again** defaults to the current user's last brew for this bag × brewer (older brews without a brewer match by method), falls back to anyone's
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
- Review happens inside bag detail (phone only): photo beside the fields; unknown = blank, never guessed; dates shown absolute + relative
  - Roaster, name, roast date, weight first; the rest collapsed
  - One **"Looks right"** button accepts everything; VLM-filled fields carry a dot until confirmed
  - Needs-review bags are brewable right away as "Untitled · Oct 21"
- One **Add bags** button (the system picker offers camera, photo library and files); each photo picked is one bag, so several bags can be added at once. A single photo goes on to "Add another · Done" for the back / sticker (max 3); saves in the background
- Autocomplete + aliases for roaster / process / variety / origin (Gesha = Geisha, Fully Washed = Washed)
- Store raw VLM output, model, prompt version, and which fields the user corrected
- Bag status: Resting / Open / Frozen / Finished; grams remaining (derived, manual adjust as an event)
  - New bags go straight into the freezer by default (setting: Freezer · Shelf); freezer time doesn't count toward age
  - Frozen bags are regular stock: brewed straight from the freezer (the rest goes back), so they're listed and pickable like any other

### Inventory browsing — the most-used feature
Browsing must be instant and finding a bag effortless. Details in `docs/UX_REVIEW.md` §2.
- **Sections** (only shown when non-empty): Needs review (phone, pinned) · Open · Ready (unopened, past rest window) · Resting · Frozen (count; never collapsed) · Finished (hidden; greyed in search results only)
- **Default sort**: Open → least left first (finish bags); Ready → oldest effective age first; Resting → soonest ready first
  - "Sort" chip: Recently added · Roast date · My rating · Roaster A–Z
- **Tile**: square bag-front thumb · roaster (small caps) · coffee name (max 2 lines) · `Origin · Process` · freshness bar + "Day 12" · **"~4 cups"** left (grams in small text) · my avg rating · one reserved line for "why it matched" (later "why recommended")
  - Not on the tile: tasting notes, producer, altitude, price, absolute roast date, brew count → bag detail
- **Freshness bar**: resting (blue-grey) → peak (green) → fading (amber) with a today tick, always with icon + word ("Resting · ready in 3d", "❄ Frozen 21d"); uses the bag's last-used method's rest window
- **Search**: as you type, no debounce; roaster, name, origin + region, producer, variety, process, flavor tags, roaster notes, my notes
  - Lowercase, accent-insensitive, aliases both ways (gesha/geisha, natural/dry process), per-word prefix, all words must match, 1 typo allowed on words ≥ 5 chars
  - Ranking: roaster/name prefix > other field > fuzzy
  - Phone: search field docked at the bottom above the tabs
- **Filters**: chips Ready · Low · Frozen · flavor families (Fruity · Floral · Chocolate & nuts · Caramel · Spice); "More" sheet: roaster, origin, process, roast level, "My ★4+" with counts, zero-count values hidden
  - Active filters as removable chips + "Clear"; on the station the sheet replaces typing
- **Tap a tile**: station → side panel with big **Brew again** (labelled method · dose · grind), "Recipe…", Open / Freeze / Finish, ±g; phone → bag detail
- **Phone**: list of 80pt rows with 64pt thumbs (not a grid); **station**: grid
- **Low / finished**: < 2× last dose → amber "Last cup"; < 1 dose → inline "Finished? ✓ · Adjust" — never auto-finish (derived grams drift)
- Empty: "No beans yet" + capture (phone) / "Add bags from your phone" (station)

## Phase 2 — Brew log + rating
- Equipment, added from settings (one grinder today, more later):
  - **Grinder**: name, setting format hint (numbers, clicks, `2.3.1`…)
  - **Method** — fixed list with an icon each: Pour-over, Hario Switch, AeroPress, Espresso, Siphon, Other
  - **Brewer** — the actual device, many per method (e.g. several pour-over drippers): name (defaults to the brewer picked), method, filter as free text
  - Icons: no open-license set covers all five methods → small custom line-icon SVG set drawn in-house (inline, `currentColor`, works in dark theme); brewers show their method icon by default
  - Brewer pictures: **illustrations created by an agent at development time** for the equipment owned today (Pour-over drippers, Hario Switch, AeroPress, Espresso, Siphon), in one consistent house style
    - Shipped as static SVG assets with the app (theme colors via CSS variables, dark-theme friendly, small, offline)
    - A brewer picks its illustration in settings; falls back to the method icon
    - New equipment later = generate another illustration in the same style during development
    - Restyling your own photos at runtime is deferred (out of scope for now)
- **Recipe** — links to a method, optionally a specific brewer and a grinder; loosely structured to start:
  - Optional core fields: dose, water / yield, temp, grind setting (with its grinder)
  - Steps as free text or a simple list — each step may carry a time, a weight, both, or neither
  - "Freestyle" is a valid recipe: method + grinder + a note, nothing else required
  - Keep every recipe; editing creates a new version so old brews still point at what was actually used
  - Versions stay in the data; the UI only shows "v3 · edited Oct 2" (no version browser)
  - Recipes are mostly created via **"Save as recipe"** after a brew; managed under Settings → Equipment & recipes
  - Brewers and grinders are **hidden** (retired), never deleted: off the brew screen, still named on old brews, back with Unhide
- **Brews start from a bag** (no separate new-brew wizard): bag → **Brew again** (last brew for this bag × method, incl. grind setting) as the primary action; "Recipe…" / freestyle as secondary
  - Station also shows ↻ Brew again shortcuts for the current brewer above the inventory grid
- Live brew screen has a pre-start state: the household's own brewers (and grinders, when more than one) preselected — never the generic method list — recipe chip, params summary `15 g · 250 g · 22 · 94°` — tap one for a stepper
- Brew deviates freely from its recipe — the brew keeps its own snapshot
- Timer: steps with times become cues; otherwise a plain stopwatch with laps
- Espresso is a preset of the same live brew screen (yield, time, "Pull another" dial-in loop), not separate screens
- Routine path, station: wake → ↻ Brew again → Start → Done · drinkers → star = **5 taps**; phone: Brew again card → Start → Done → star = **4 taps**
- Steppers & chips only — no typing during brew; undo instead of confirms
- Auto-decrement grams remaining by dose (derived from the brew)
- Rating, tiered — every tap autosaves (no submit button):
  1. **Overall 1–5** (required) — **inline stars on the pending-tasting card** (phone home, station pending strip): one tap, no navigation
     - Labels under the selected star: ★ Wouldn't finish · ★★ Meh · ★★★ Good · ★★★★ Great · ★★★★★ Memorable
     - Five 64px star buttons
     - Not prompted at Done — the cup is too hot then
  2. **Cup temperature: Hot / Warm / Cool** — a chip on the card ("Warm · 14 min"), preselected from `minutes_after_brew`, tap cycles to override by feel
     - Shown as a steaming-cup icon (three wisps Hot, one Warm, none Cool): with the word wherever a cup is being rated, icon only in Tastings and bag history
     - Thresholds are a user-editable setting (start: < 10 min Hot, 10–25 Warm, > 25 Cool)
     - Store both the suggested and chosen band → later compare against time since brew and retune thresholds
  3. "More detail" (the rate screen; all shipped in Phase 2), in this order:
     - Profile, each 1–5, words only at 1 / 3 / 5 (Low · Medium · High): aroma, acidity, sweetness, body, aftertaste
     - Quality, each 1–5, words only at 1 / 3 / 5, visually separate from Profile: balance (Unbalanced · OK · Harmonious), cleanness (Muddy · OK · Clean)
     - Flavor tags: roaster's notes first as one-tap confirm chips ("Roaster says: blueberry, cocoa"), then browse by flavor family
     - Other notes (free text)
     - Liking lives in the overall score; only balance and cleanness are judgments by nature
- **Multiple tastings per brew** — per taster and per temperature, to track how a cup performs as it cools
  - Nothing is gated by time: the temperature thresholds only suggest a band; a cup can be rated again at any moment ("Rate again")
  - Every rating is its own tasting with its time and minutes after brewing — two at the same temperature stay apart
  - Changing a rating is an explicit Edit (keeps its time); the rate screen lists every rating of the cup
  - Pending cards: unrated up to 12 h after brewing, rated ones (latest rating · Edit · Rate again) up to 2 h; any cup can still be rated from its bag or Tastings
  - No push for re-rates
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

## Phase 4 — Recommendations (after there's data)
- On the station: pick a flavor / style / mood (e.g. "fruity & bright", "chocolatey", "something new") → suggest beans in stock + recipes that rated well
- Per person: uses that person's tastings; falls back to everyone's
- Not built now, but the data must support it — keep these consistent from day one:
  - Flavor tags from one controlled vocabulary (SCA wheel based) for both roaster notes and tasted tags
  - Process / origin / variety / roast level normalized through aliases
  - Every brew linked to bag, recipe version, brewer, grinder; every tasting linked to a brew and a person
  - Tag source (roaster vs. tasted), how a brew was started (`brew_again` / `recipe` / `freestyle` / later `suggestion`), drinkers even when they never rate, repeat brews per bag × person (implicit "liked it")
- UI hooks already in place:
  - The station's flavor-family chip row becomes "Feel like…" (+ "Something new", "Finish soon")
  - Inventory filters are one query object (`{families, process, origin, state, sort}`); a mood chip produces the same query with `sort: score` → recommendations reuse the inventory grid
  - The tile's reserved line shows why a bag was suggested; the brew pre-start screen gets a "Best for this bag: Recipe v3 ★4.2" slot
  - Log which suggestions were shown and which were picked

## Data model (decide early)
- `Roaster → Coffee → Bag → Brew → Tasting` (re-buys link to the same Coffee)
- All entities: client-generated UUID, `created_at`, `updated_at`, `deleted_at` (tombstone)
- `Grinder`, `Brewer` (`method` enum, filter, optional `illustration` key), `Recipe` (versioned; `method`, optional `brewer_id` / `grinder_id`, optional core params, `steps` as text or JSON list, note, `author_id`)
- Brew stores a **snapshot** of params (+ `recipe_id` / version for provenance, null for freestyle)
- Brew params: typed core, all optional except method (brewer, dose, water/yield, time, temp, grinder + setting as string) + JSON for method-specific extras
- `User`: name, avatar/color; no credentials
- Brew: `brewer_id` (user), `started_from`; `BrewTaster` (brew × user) is no longer written — anyone can rate any brew
- Tasting (many per brew): `schema_version`, `taster_id`, `rated_at`, `minutes_after_brew`, `temp_band` + `temp_band_suggested` (hot/warm/cool), `overall` (1–5), optional aroma / acidity / sweetness / body / aftertaste / balance / cleanness (1–5), tags (with source), note (the compass columns stay for old ratings; no longer shown)
- Storage as events (opened, frozen, thawed, finished, gram adjustments), not booleans or counters
- Deleting (phone only) a bag, brew or rating asks first and names what goes with it (a bag's brews, ratings and photos; a brew's ratings, its dose back to the bag), then offers Undo for 5 s; a delete confirmed just before the app closes is carried out on the next start
- `updated_by` on shared entities (who edited a bag)
- Settings (synced): temperature band thresholds, rest windows per method
- Server keeps a monotonic change sequence for the pull cursor

## Out of scope (for now)
Bluetooth scales, water chemistry, social sharing, roaster databases, barcode scanning (QR → roaster URL maybe later),
native app shell / iOS Live Activities, enforced rating windows, remote sync over VPN,
runtime restyling of brewer photos (background removal).

## Pitfalls to watch
1. Required input per routine brew must stay < ~10 s
2. Don't build analytics before there's data
3. Never let VLM write without review; track per-field correction rate
4. Espresso ≠ filter — its own preset and params on the same live brew screen, shared model
5. Keep the same origin on every device and network, or local data splits
6. Sync must be idempotent (outbox retries after flaky Wi-Fi must not duplicate brews)
7. Ship capture → inventory → brew again → one-tap rating, use it a month, then re-scope
