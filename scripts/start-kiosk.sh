#!/usr/bin/env bash
set -u

if [ -f /etc/narrowcasting/kiosk.env ]; then
  # shellcheck disable=SC1091
  . /etc/narrowcasting/kiosk.env
fi

KIOSK_URL="${KIOSK_URL:-http://localhost:4174/player}"
RESTART_DELAY_SECONDS="${RESTART_DELAY_SECONDS:-10}"
CHROMIUM_PROFILE_DIR="${CHROMIUM_PROFILE_DIR:-${HOME:-/tmp}/.config/narrowcasting/chromium-kiosk}"

if [ -z "${DISPLAY:-}" ] && [ -z "${WAYLAND_DISPLAY:-}" ]; then
  echo "No graphical session detected. Kiosk will start after desktop login/autostart." >&2
  exit 0
fi

prepare_desktop_session() {
  if [ -n "${DISPLAY:-}" ] && command -v xset >/dev/null 2>&1; then
    xset s off >/dev/null 2>&1 || true
    xset s noblank >/dev/null 2>&1 || true
    xset -dpms >/dev/null 2>&1 || true
  fi

  if command -v unclutter >/dev/null 2>&1; then
    unclutter -idle 1 -root >/dev/null 2>&1 &
  fi
}

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

mkdir -p "$CHROMIUM_PROFILE_DIR"
prepare_desktop_session

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
    --user-data-dir="$CHROMIUM_PROFILE_DIR" \
    --kiosk "$KIOSK_URL" \
    --start-fullscreen \
    --no-first-run \
    --no-default-browser-check \
    --noerrdialogs \
    --disable-infobars \
    --disable-default-apps \
    --disable-background-networking \
    --disable-component-update \
    --disable-sync \
    --disable-translate \
    --disable-save-password-bubble \
    --disable-password-generation \
    --disable-session-crashed-bubble \
    --disable-features=TranslateUI,AutofillServerCommunication,PasswordManagerOnboarding,MediaRouter \
    --password-store=basic \
    --use-mock-keychain \
    --autoplay-policy=no-user-gesture-required \
    --check-for-update-interval=31536000 &
  child_pid="$!"
  wait "$child_pid"
  exit_code="$?"
  echo "chromium kiosk exited with code $exit_code; restarting in ${RESTART_DELAY_SECONDS}s" >&2
  sleep "$RESTART_DELAY_SECONDS"
done
