# Coffee Tracker — Draft Scope

Self-hosted web app (home network only) for tracking coffee bean inventory, brews, and cup quality.
Phone = capture & reflection. Tablet (mounted at the coffee station) = brewing station.

## Stack (proposed)
- Backend: Python (FastAPI) + SQLite, on the home server
- Frontend: installable PWA (tablet in kiosk / standalone mode, dark theme, Wake Lock while brewing)
- Extraction: local Ollama VLM (`qwen3.5:4b`, compare `gemma4:e4b`) — see `extract_beans.py`
- Open question: HTTPS on LAN (Caddy internal CA / Tailscale certs) — required for push notifications & camera on some browsers

## Phase 1 — Bean inventory (MVP)
- Snap 1–3 photos of a bag (front/back/sticker) on phone → saved immediately as *Needs review*
- VLM extraction runs in background: roaster, coffee name, origin, producer, variety, process, roast level, altitude, tasting notes, roast date, weight, other notes
- Review screen: photo side-by-side with fields; unknown = blank, never guessed; dates shown absolute + relative
- Autocomplete + aliases for roaster / process / variety / origin (Gesha = Geisha, Fully Washed = Washed)
- Store raw VLM output, model, prompt version, and which fields the user corrected
- Bag status: Resting / Open / Frozen / Finished; grams remaining (manual adjust)
- Tablet inventory: photo tiles with days-off-roast, rest-status color, grams left

## Phase 2 — Brew log + rating
- Equipment entities (brewers, grinders, filters); grinder setting stored with grinder id
- Recipe templates per method; **Brew again** (last recipe for this bag × method) as the primary action
- Grind setting memory per bag × method × grinder
- Optional step timer (bloom, pours); espresso "Pull another" dial-in loop
- Steppers & chips only — no typing during brew; ≥64px targets; undo instead of confirms
- Auto-decrement grams remaining by dose
- Rating, tiered:
  1. Overall 1–10 (required, one tap at "Done")
  2. Optional compass: Sour↔Balanced↔Bitter, Weak↔Balanced↔Strong
  3. Optional detail: sweetness/acidity/body/aftertaste (1–5), flavor tags, free note
- "Pending tasting" card for ~2h; record `minutes_after_brew`; unrated brews stay unrated
- Rest windows per method (configurable), freezer in/out events → effective age

## Phase 3 — Insights & extras
- Sorted tables, best brew per bag, simple scatters (no premature "insights" — data is sparse & confounded)
- SCA flavor-wheel tags; roaster notes vs. tasted notes
- Cost per cup, re-buy / wishlist from archived coffees
- Recipe card export

## Data model (decide early)
- `Roaster → Coffee → Bag → Brew → Tasting` (re-buys link to the same Coffee)
- Brew stores a **snapshot** of recipe params (+ `template_id` for provenance)
- Brew params: typed core (method, dose, water/yield, time, temp, grinder+setting) + JSON for method-specific extras
- Tasting: `schema_version`, `taster_id`, `rated_at`, `minutes_after_brew`; overall score stable across versions
- Storage as events (opened, frozen, thawed, finished), not booleans
- `user_id` on brews/tastings from day one

## Out of scope (for now)
Bluetooth scales, water chemistry, social sharing, roaster databases, barcode scanning (QR → roaster URL maybe later).

## Pitfalls to watch
1. Required input per routine brew must stay < ~10 s
2. Don't build analytics before there's data
3. Never let VLM write without review; track per-field correction rate
4. Espresso ≠ filter — separate flows, shared model
5. Ship capture → inventory → brew again → one-tap rating, use it a month, then re-scope
