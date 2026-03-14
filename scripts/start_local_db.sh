#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_DB_DIR="$ROOT_DIR/.local-postgres"
DATA_DIR="$LOCAL_DB_DIR/data"
LOG_FILE="$LOCAL_DB_DIR/postgres.log"
PORT="${PORT:-54322}"
DB_NAME="${DB_NAME:-drawtosearch}"
DB_USER="${DB_USER:-postgres}"

mkdir -p "$LOCAL_DB_DIR"

if [ ! -d "$DATA_DIR" ]; then
  initdb -D "$DATA_DIR" --auth=trust --username="$DB_USER" >/dev/null
  {
    echo "listen_addresses = '127.0.0.1'"
    echo "port = $PORT"
  } >>"$DATA_DIR/postgresql.conf"
  {
    echo "host all all 127.0.0.1/32 trust"
    echo "host all all ::1/128 trust"
  } >>"$DATA_DIR/pg_hba.conf"
fi

if ! pg_ctl -D "$DATA_DIR" status >/dev/null 2>&1; then
  pg_ctl -D "$DATA_DIR" -l "$LOG_FILE" -o "-p $PORT" start >/dev/null
fi

until pg_isready -h 127.0.0.1 -p "$PORT" >/dev/null 2>&1; do
  sleep 1
done

createdb -h 127.0.0.1 -p "$PORT" -U "$DB_USER" "$DB_NAME" >/dev/null 2>&1 || true

echo "Local Postgres is ready."
echo "DATABASE_URL=postgres://$DB_USER@127.0.0.1:$PORT/$DB_NAME"
