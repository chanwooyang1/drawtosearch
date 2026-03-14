#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="$ROOT_DIR/.local-postgres/data"

if [ ! -d "$DATA_DIR" ]; then
  echo "No local Postgres data directory found."
  exit 0
fi

if pg_ctl -D "$DATA_DIR" status >/dev/null 2>&1; then
  pg_ctl -D "$DATA_DIR" stop >/dev/null
  echo "Local Postgres stopped."
else
  echo "Local Postgres is not running."
fi
