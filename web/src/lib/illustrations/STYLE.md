# Brewer illustration style

Every brewer picture follows these rules so new ones match the set.

- 256 × 256 `viewBox`, object centered, sitting on a soft ground shadow (`ellipse.sh`, cy ≈ 214–222).
- Flat shapes only: no gradients, filters, text or embedded images. Keep each file ≤ 6 KB.
- Colors come from classes, never hard-coded fills:
  - `.b` body (neutral, `--ill-body`), `.d` dark parts (`--ill-dark`), `.a` signature color (`--ill-accent`)
  - `.g` tinted glass (accent at ~45 % opacity), `.gl` clear glass (`--ill-glass`)
  - `.s` outline stroke (`--ill-line`, width 5, round caps/joins), `.s.thin` detail lines (width 3, 60 %)
  - `.h` highlight (white, ~55 %), `.sh` ground shadow, `.in` inner opening, `.fl` flame
- Draw the recognizable features (V60 spiral ribs, Kadou fluted rim + angular handle, Switch lever,
  AeroPress plunger + cap, Dedica slim body + side wand, Siphon two globes on a stand); skip logos and text.
- Each entry in `index.ts` sets the brewer's signature color (`accent`) — the one fill that tells brewers apart.
- Review new drawings in the gallery (Settings → Equipment, or `/dev/gallery` in dev) in light and dark themes.
