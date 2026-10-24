#!/bin/sh
# Restore the database from a snapshot in <data>/backups (default: the newest), plus any missing photos.
# The current database is kept next to it as coffee.db.before-restore-<time>.
# Devices notice the restore on their next sync, send back anything newer they have, and pull again.
# Usage: deploy/restore.sh [coffee-YYYYMMDD-HHMMSS.db]
set -eu
cd "$(dirname "$0")"
docker compose stop app
docker compose run --rm --no-deps app python -m app.backup restore --backups /data/backups ${1:+"/data/backups/$1"}
docker compose start app
