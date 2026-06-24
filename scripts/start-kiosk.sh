#!/usr/bin/env bash
set -u

KIOSK_URL="${KIOSK_URL:-http://localhost:4174/player}"
RESTART_DELAY_SECONDS="${RESTART_DELAY_SECONDS:-3}"

find_chromium() {
  command -v chromium-browser 2>/dev/null ||
    command -v chromium 2>/dev/null ||
    command -v google-chrome 2>/dev/null
}

CHROMIUM_BIN="${CHROMIUM_BIN:-$(find_chromium)}"

if [ -z "$CHROMIUM_BIN" ]; then
  echo "Chromium executable not found. Install chromium-browser or set CHROMIUM_BIN." >&2
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
  "$CHROMIUM_BIN" \
    --kiosk "$KIOSK_URL" \
    --start-fullscreen \
    --noerrdialogs \
    --disable-infobars \
    --disable-session-crashed-bubble \
    --disable-features=TranslateUI \
    --autoplay-policy=no-user-gesture-required \
    --check-for-update-interval=31536000 &
  child_pid="$!"
  wait "$child_pid"
  exit_code="$?"
  echo "chromium kiosk exited with code $exit_code; restarting in ${RESTART_DELAY_SECONDS}s" >&2
  sleep "$RESTART_DELAY_SECONDS"
done
