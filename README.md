# Coffee Tracker

Self-hosted app for coffee bean inventory, brews and cup ratings. One installable web app with a
phone layout and a station (tablet) layout; works offline and syncs with the home server on Wi-Fi.

- Product scope: [`SCOPE.md`](SCOPE.md)
- Engineering plan and milestones: [`PLAN.md`](PLAN.md)
- UX review: [`docs/UX_REVIEW.md`](docs/UX_REVIEW.md)

## Layout

```
server/   FastAPI + SQLite: sync API, serves the built frontend
web/      Svelte 5 + Vite PWA: IndexedDB store, outbox, sync client
deploy/   Docker Compose: app + Caddy (HTTPS via Cloudflare DNS-01), backup script
tools/    extract_beans.py — label extraction eval harness (Ollama VLM)
```

## Development

Requirements: Python 3.12+ with [`uv`](https://docs.astral.sh/uv/), Node 22.

```sh
# server (http://127.0.0.1:8000)
cd server
uv sync
uv run uvicorn app.main:app --reload

# web (http://localhost:5173, proxies /api to the server)
cd web
npm install
npm run dev
```

Tests:

```sh
cd server && uv run pytest          # sync API, backup
cd web && npm test                  # outbox, sync client, domain logic
cd web && npm run check             # svelte-check / TypeScript
cd web && npm run e2e               # builds, starts the server, runs Playwright (phone + station)
```

## Preview without the home server

`.github/workflows/pages.yml` publishes a static build to GitHub Pages on every push to `main`
(`https://<user>.github.io/coffee-tracker/`). Preview builds have sync turned off — everything stays on
the device — so the app can be installed and tried on a phone while away from home. One-time setup:
repo Settings → Pages → Source: "GitHub Actions". Pages on a private repo needs a paid GitHub plan,
and the published site is public (it contains only the app, no data).

## Deployment (home server)

Everything stays on the LAN: Caddy gets a real Let's Encrypt certificate through a Cloudflare DNS
challenge, so nothing has to be exposed to the internet and no device needs a custom certificate.

1. **Cloudflare API token** — Cloudflare dashboard → My Profile → API Tokens → Create Token →
   "Edit zone DNS" template, limited to your domain's zone.
2. **Local DNS** — in UniFi Network, add a local DNS record `coffee.<your-domain>` → the server's
   LAN IP. Optional fallback for devices that bypass the router's DNS (iCloud Private Relay,
   Android Private DNS): a DNS-only (grey cloud) Cloudflare A record with the same LAN IP.
3. **Configure** — `cp deploy/.env.example deploy/.env` and fill in `COFFEE_HOST`, `ACME_EMAIL`,
   `CLOUDFLARE_API_TOKEN`.
4. **Start** — `cd deploy && docker compose up -d --build`. Data lives in `./data` at the repo root
   (override with `COFFEE_DATA`). The first start takes a minute while Caddy obtains the certificate:
   `docker compose logs -f caddy`.
5. **Install the app**
   - iPhone / iPad: open `https://coffee.<your-domain>` in Safari → Share → Add to Home Screen.
   - Android tablet: open it in Chrome (or another Chromium browser) → menu → Install app. For a
     kiosk, use screen pinning or Fully Kiosk Browser.
   - Open Settings in the app, add the people in the household, and pick who uses each device.
6. **Backups** — `deploy/backup.sh` snapshots the database into `data/backups` (keeps 14). Run it
   nightly from cron, e.g. `30 3 * * * /path/to/coffee-tracker/deploy/backup.sh`, and copy
   `data/` off the machine as part of your usual backups.

Label reading uses the Ollama instance on the server (`OLLAMA_HOST`, model `COFFEE_VLM_MODEL`, default
`qwen3.5:4b`). If Ollama is down, bags are still added and the review screen offers a retry; set
`COFFEE_EXTRACTION=off` to turn it off. For local development without Ollama,
`COFFEE_EXTRACTION=fake` answers every bag with the same sample label.

Updating: `git pull && cd deploy && docker compose up -d --build`. Installed apps pick up the new
version on their next launch.
