#!/bin/sh
# Nightly snapshot of the database into <data>/backups (keeps 14).
# Example crontab: 30 3 * * * /path/to/coffee-tracker/deploy/backup.sh
set -eu
cd "$(dirname "$0")"
docker compose exec -T app python -m app.backup /data/backups --keep 14
