# UX Review — Coffee Tracker (draft, against SCOPE.md / PLAN.md as of 2026-10-23)

Not yet folded into SCOPE.md / PLAN.md — decisions pending.

## 1. Top 5 recommendations

1. **Station home = inventory; brews start from a bag.** Kill the `/brew/new` wizard (who's brewing → bag → method → brewer → mode). The bag is the first decision; method, brewer and recipe default from it.
2. **Inline stars on pending-tasting cards / the station's pending strip.** Routine rating becomes one tap with no navigation. `/rate` is only for "More detail".
3. **Persist people instead of asking.** "Who's brewing" = a sticky avatar in the header (defaults to last brewer), not a step. "Who's drinking" = prefilled from this brewer's last brew, confirmed in the same tap as Done.
4. **Inventory sorted by "what should I brew next"** — Open → Ready → Resting → Frozen (collapsed) — with as-you-type, accent- and alias-tolerant, typo-forgiving search, plus filter chips so the station works with zero typing.
5. **Cut screens from 11 to 7.** Merge Review into Bag detail; Recipes into Settings → Equipment; History into Home "Recent". The station gets no capture, review or history screens.

## 2. Inventory browsing

**Sections (in order):** Needs review (phone only, pinned) · **Open** · **Ready** (unopened, past rest window) · **Resting** · **Frozen** (collapsed, count shown) · Finished (hidden; appears greyed in search results only). Sections only render when non-empty.

**Default sort within a section:** Open: least remaining first (finish bags). Ready: oldest effective age first. Resting: soonest-ready first. One "Sort" chip offers: Recently added · Roast date · My rating · Roaster A–Z.

**Tile shows:** square bag-front thumb · roaster (small caps, 13px) · coffee name (17–18px, max 2 lines) · `Origin · Process` · freshness bar + "Day 12" · remaining as **"~4 cups"** (grams ÷ last dose, grams in small text) · my avg rating if any · one reserved line for "why it matched" (e.g. "variety: Gesha") — reused in Phase 4 as "why recommended".

**Tile does not show:** tasting notes, producer, altitude, variety (unless matched), price, absolute roast date, brew count. Those live in Bag detail.

**Freshness bar:** 4px bar along the tile bottom with three zones — resting (blue-grey) → peak (green) → fading (amber) — and a "today" tick. Always paired with an icon + word ("Resting · ready in 3d", "❄ Frozen 21d"), never color alone. Rest windows are per method, so the tile uses the bag's last-used method (or the household's primary method); detail shows all methods.

**Search:** fields = roaster, coffee name, origin (country + region), producer, variety, process, flavor tags, roaster notes, my notes. Normalize: lowercase, strip accents (Café = cafe), expand aliases both ways (gesha/geisha, natural/dry process). Per-token prefix match, all tokens must match (AND). Edit distance 1 for tokens ≥ 5 chars. Rank: roaster/name prefix > other field > fuzzy. Updates every keystroke, no debounce (filtering is synchronous; only rendering costs). Phone: search field docked at the bottom above the tab bar (thumb reach).

**Filters:** chips always visible: Ready · Low · Frozen · flavor families (Fruity · Floral · Chocolate & nuts · Caramel · Spice — top level of the controlled vocabulary). "More" sheet: roaster, origin, process, roast level, "My ★4+" — each value shows counts, zero-count values hidden, all tappable. Active filters shown as removable chips + "Clear". The sheet is the station's search (no typing there).

**Quick actions:** station: tap a tile → 360px side panel with big **Brew again** (labelled with method · dose · grind), "Recipe…", Open / Freeze / Finish, ±g. No long-press, no swipe. Phone: tap → Bag detail.

**States:** empty: "No beans yet" + capture button (phone) / "Add bags from your phone" (station). Low: < 2× last dose → amber "Last cup". Derived grams drift → when < 1 dose, ask inline "Finished? ✓ · Adjust" — never auto-finish. Needs-review bags are brewable immediately as "Untitled · Oct 21".

**Fire 7 performance:** 240px WebP thumbs (~10 KB); `loading=lazy decoding=async`, fixed aspect ratio (no layout shift); `content-visibility:auto` + `contain-intrinsic-size` on tiles; keyed tiles, filtering toggles `hidden` instead of re-rendering; recompute sort keys and derived values only after a sync batch, not per render; no shadows, blur or transitions; the station never caches full-size photos.

**Bridge to recommendations:** express every filter as one query object `{families, process, origin, state, sort}`. In Phase 4 a mood chip produces the same query with `sort: score` — the recommendation view is this same grid.

```
STATION 1024×600
┌──────────────────────────────────────────────────────────┐
│(E)Eugene ▾ │ Fruity Floral Choc Caramel │ More ▾ │Sort│ ● │ 56
├──────────────────────────────────────────────────────────┤
│ ↻ V60·Kenya Kii 15g/22   ↻ Switch·Ethiopia   ↻ Espresso  │ 80
├──────────────────────────────────────────────────────────┤
│ OPEN                                                     │
│┌────────┐┌────────┐┌────────┐┌────────┐                  │
││ [img]  ││ [img]  ││ [img]  ││ [img]  │  →  2 rows,      │
││ONYX    ││TIM WEN.││...     ││        │     scroll       │
││Kii AA  ││Gesha   ││        ││        │     vertically   │
││Kenya·W ││Panama·N││        ││        │                  │
││▬▬▬▮▬ D12││▬▮▬▬ D5 ││        ││        │                  │
││~4 cups ││LAST CUP││        ││        │                  │
│└────────┘└────────┘└────────┘└────────┘                  │
│ Pending: (A)Ana ☆☆☆☆☆  Warm·14m                          │
└──────────────────────────────────────────────────────────┘
PHONE
┌────────────────────┐
│ Inventory   + Snap │
│ NEEDS REVIEW (1)   │
│[▣] Untitled·Oct 21 │
│ OPEN               │
│[▣] Onyx·Kii AA     │
│    Kenya·Washed    │
│    D12 ▬▬▮ ~4 cups │
│[▣] Tim W.·Gesha  … │
│ READY · RESTING ▾  │
│[Fruity][Low][More] │
│[🔍 Search beans   ]│
│ Home Inv Brew  ⚙   │
└────────────────────┘
```

Phone: a list (80pt rows, 64pt thumbs), not a grid — text scans faster than photos at that width.

## 3. Per-screen review

- **`/` Home.** Phone: keep — pending cards with inline stars → Brew again cards (max 3) → Recent (absorbs History). Station: cut; its home is the inventory.
- **`/inventory`.** Keep, per §2.
- **`/bag/:id`.** Keep and absorb the **review** state. On the station it's the side panel, not a page. Order: big Brew again → status buttons → this bag's brews and ratings → coffee fields.
- **`/capture`.** Keep, phone only. Opens the camera immediately; after each shot, "Add another · Done" (max 3); saves in the background.
- **`/review/:bagId`.** Merge into Bag detail (phone only). Photo beside the fields; roaster, name, roast date, weight first, the rest collapsed. One **"Looks right"** button accepts all. Fields filled by the VLM carry a dot until confirmed.
- **`/brew/new`.** Cut. Replace with the pre-start state of the live brew screen: method / brewer chips preselected, a recipe chip, and a tappable parameter summary.
- **`/brew/:id`.** Keep, full screen. Pre-start: params shown as `15 g · 250 g · 22 · 94°`, tap one for a stepper. Timer digits 160px; current step label 40px; next-cue countdown 64px. Done → prefilled drinkers sheet.
- **`/rate/:brewId`.** Keep, but only for detail; routine rating happens inline.
- **`/history`.** Merge into phone Home. Cut on the station.
- **`/recipes`.** Demote to Settings → Equipment & recipes. Create recipes mainly via "Save as recipe" after a brew. Show versions only as "v3 · edited Oct 2"; no version browser.
- **`/settings`.** Keep. Station shows only users, sync, layout and thresholds, opened by tapping the sync dot.

## 4. Brew → rate flow

**Station, current plan:** wake (1) → who's brewing (1) → bag (1–2, often a scroll) → method (1) → brewer (1) → Brew again (1) → Start (1) → Done (1) → who's drinking (1–2) → confirm (1) → go to rate (1) → star (1) = **12–14 taps, ~15–20 s** of input. Over budget at the wizard and at the separate rate screen.

**Station, proposed:**
1. First tap only wakes the screen (no action — protects against accidental bumps). (1)
2. Tap a ↻ Brew again shortcut (shortcuts belong to the header's brewer). (2)
3. Start. (3)
4. **Done · Eugene + Ana** — drinkers prefilled from last time; one tap confirms, tapping a chip edits the set. (4)
5. Later: tap a star next to your avatar in the pending strip. (5)

= **5 taps, ~5 s**. If someone else is brewing: +2 (header avatar → name). Show the brewer's avatar large on the wake screen so a wrong attribution is obvious; the brewer stays editable on the brew afterwards.

**Phone:** Home → Brew again card (1) → Start (2) → Done ("me" preselected as drinker) (3) → star on the pending card (4). Don't prompt for a rating at Done — the cup is too hot.

**Rate again as it cools:** after a tasting the card stays, muted, as "Rate again when Warm". When the temperature band changes it reappears as "Warm now · 18 min ☆☆☆☆☆" (still one tap). Edits within 5 minutes update the same tasting rather than creating a new one. No push notifications for re-rates.

**Multi-person rating on the station:** tapping an avatar opens a stars sheet headed by that person's name at 32px; it auto-closes 1.5 s after a tap, with undo.

## 5. Station (POS) layout specifics

- **Targets:** 72px for primary actions, ≥ 56px for secondary, 12px gaps, 16px dead zone along the bezels (the Fire 7 is ~171 ppi, so 72px ≈ 10.7 mm).
- **Glanceable at 1–1.5 m:** timer 160px, step label 40px, tile titles 18px, body text never below 16px.
- **Wet or greasy hands:** taps only — no swipe, long-press or drag. Ignore a second tap within 300 ms. Undo toasts (5 s, 72px button) instead of confirm dialogs. Done and Reset at opposite ends of the screen.
- **1024×600 landscape:** Fully Kiosk immersive mode to get the full 600px. At most three horizontal bands (header 56 / shortcuts 80 / grid) plus the side panel for detail.
- **Dark theme:** background #121212, not pure black (the Fire 7 is an LCD). Text #EDEDED. Desaturated status colors at ≥ 4.5:1 contrast, always with an icon.
- **Idle / attract screen:** after 2 min idle, dim to a clock + last brewer's avatar + pending-tasting count + "Tap to start". Use a Fully Kiosk schedule to keep the screen on during brewing hours and off otherwise.
- **Wake lock:** during a live brew and for 10 min after Done; re-acquire on `visibilitychange`.
- **Sync status:** a header dot. Green, no label, when synced; amber with a count ("3") when changes are pending; crossed-out cloud + "Saved on this tablet" when offline. Never block the screen for sync. The only modal is a storage-full warning.

## 6. Rating UX

- **Overall labels:** "Off" is ambiguous (a defect, or just a bad day?), and "Brew again" collides with the primary button name. Proposal: **Wouldn't finish · Meh · Good · Great · Memorable**. Five 64px star buttons; the label for the selected star appears below.
- **Preselected temperature:** storing only the chosen band can't tell "agreed" from "didn't look", so threshold tuning gets no signal. Store **`temp_band_touched`**. Render the band as a chip, "Warm · 14 min", that cycles on tap — not a separate row.
- **Detail scales:** one shared 1–5 control for intensity and quality implies "more is better". Split them:
  - **Profile:** aroma, acidity, sweetness, body, aftertaste as Low · Med · High chips (stored as 1/3/5) — five steps of intensity is false precision for home tasters.
  - **Quality:** balance and cleanness as worded segments ("Muddy · OK · Clean"), visually separated from Profile.
- **Order inside More detail:** compass first (most useful for dialing in) → tags → note → profile → quality. Add helper text that "Sour" (a negative judgment) is not the same as high acidity (a neutral intensity).
- **Tags:** start with the roaster's notes as one-tap confirm chips ("Roaster says: blueberry, cocoa"), then browse by flavor family.

## 7. Leave room for recommendations

- **UI hooks:**
  - The station's flavor-family chip row becomes "Feel like…" in Phase 4 (adding "Something new" and "Finish soon").
  - The tile's reserved line shows why a bag was suggested.
  - The brew pre-start screen gets a slot for "Best for this bag: Recipe v3 ★4.2".
- **Capture now:** `tag_source` (roaster / tasted), `temp_band_touched`, `brew.started_from` (brew_again / recipe / freestyle / later: suggestion), drinkers even when they never rate, and repeat brews per bag × person (an implicit "liked it" signal).
- **Phase 4:** log which suggestions were shown and which were picked.

## 8. Risks / things to cut

- **Detail scales:** M3 ships all 7 detail scales plus the compass, which goes against scope pitfall #7. Ship stars + temperature + tags + note first; add the detail scales after a month of use.
- **Recipe versioning:** keep it in the data, drop the version UI.
- **Brewer photos:** cut; the line icons are enough.
- **Espresso:** a preset of the same live brew screen, not separate screens.
- **Station:** no capture, review or history.
- **Derived grams drift:** show "~4 cups" rather than exact grams; confirm before finishing a bag.
- **Wrong person on the station:** prominent avatar, and the brewer can be fixed after the fact.
- **Fire 7 memory:** cache thumbnails only on the station; enforce the 100 KB JS budget.
