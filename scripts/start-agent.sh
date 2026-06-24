#!/usr/bin/env bash
set -u

ROOT_DIR="${NARROWCASTING_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
APP_DIR="$ROOT_DIR/agent"
RESTART_DELAY_SECONDS="${RESTART_DELAY_SECONDS:-3}"

export SERVER_URL="${SERVER_URL:-http://localhost:3000}"
export CACHE_DIR="${CACHE_DIR:-../player/public/data}"
export MEDIA_DIR="${MEDIA_DIR:-../player/public/media}"
export STATUS_PATH="${STATUS_PATH:-../server/data/agent-status.json}"

cd "$APP_DIR" || exit 1

if [ ! -f "dist/index.js" ]; then
  echo "agent/dist/index.js not found. Run: cd agent && npm run build" >&2
  exit 1
fi

child_pid=""

stop_child() {
  if [ -n "$child_pid" ] && kill -0 "$child_pid" 2>/dev/null; then
    kill "$child_pid"
    wait "$child_pid" 2>/dev/null
  fi
  exit 0
}

trap stop_child INT TERM

while true; do
  node dist/index.js &
  child_pid="$!"
  wait "$child_pid"
  exit_code="$?"
  echo "narrowcasting agent exited with code $exit_code; restarting in ${RESTART_DELAY_SECONDS}s" >&2
  sleep "$RESTART_DELAY_SECONDS"
done
