#!/usr/bin/env bash
set -u

if [ -f /etc/narrowcasting/kiosk.env ]; then
  # shellcheck disable=SC1091
  . /etc/narrowcasting/kiosk.env
fi

DEFAULT_KIOSK_URL="http://localhost:4174/player"
DEFAULT_KIOSK_DEBUG_URL="http://localhost:4174/player?debug=1"
KIOSK_URL="${KIOSK_URL:-$DEFAULT_KIOSK_URL}"

if [ "${NARROWCASTING_PLAYER_DEBUG:-0}" = "1" ] && [ "$KIOSK_URL" = "$DEFAULT_KIOSK_URL" ]; then
  KIOSK_URL="${KIOSK_DEBUG_URL:-$DEFAULT_KIOSK_DEBUG_URL}"
fi
RESTART_DELAY_SECONDS="${RESTART_DELAY_SECONDS:-10}"
CHROMIUM_PROFILE_DIR="${CHROMIUM_PROFILE_DIR:-${HOME:-/tmp}/.config/narrowcasting/chromium-kiosk}"
CHROMIUM_REMOTE_DEBUGGING_ADDRESS="${CHROMIUM_REMOTE_DEBUGGING_ADDRESS:-127.0.0.1}"
CHROMIUM_REMOTE_DEBUGGING_PORT="${CHROMIUM_REMOTE_DEBUGGING_PORT:-9222}"
BROWSER_RENDERER_CONTROL_URL="${BROWSER_RENDERER_CONTROL_URL:-http://127.0.0.1:4175/browser-renderer/render}"

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

write_chromium_preferences() {
  local default_dir="$CHROMIUM_PROFILE_DIR/Default"
  local preferences_file="$default_dir/Preferences"

  mkdir -p "$default_dir"

  cat > "$preferences_file" <<EOF
{
  "autofill": {
    "credit_card_enabled": false,
    "profile_enabled": false
  },
  "browser": {
    "check_default_browser": false,
    "has_seen_welcome_page": true
  },
  "credentials_enable_service": false,
  "profile": {
    "content_settings": {
      "exceptions": {
        "automatic_downloads": {},
        "geolocation": {},
        "media_stream_camera": {},
        "media_stream_mic": {},
        "notifications": {},
        "popups": {}
      }
    },
    "default_content_setting_values": {
      "geolocation": 2,
      "media_stream_camera": 2,
      "media_stream_mic": 2,
      "notifications": 2,
      "popups": 2
    },
    "exit_type": "Normal",
    "exited_cleanly": true,
    "password_manager_enabled": false
  },
  "session": {
    "exit_type": "Normal",
    "restore_on_startup": 4,
    "startup_urls": [
      "$KIOSK_URL"
    ]
  },
  "signin": {
    "allowed": false
  },
  "sync": {
    "requested": false,
    "suppress_start": true
  },
  "translate": {
    "enabled": false
  }
}
EOF
}

write_chromium_preferences

log_kiosk_startup() {
  echo "narrowcasting kiosk starting" >&2
  echo "chromium: $("$CHROMIUM_BIN" --version 2>/dev/null || echo unknown)" >&2
  echo "profile: $CHROMIUM_PROFILE_DIR" >&2
  echo "kiosk url: $KIOSK_URL" >&2
  echo "player debug: ${NARROWCASTING_PLAYER_DEBUG:-0}" >&2
  echo "browser renderer control: $BROWSER_RENDERER_CONTROL_URL" >&2
  echo "remote debugging: $CHROMIUM_REMOTE_DEBUGGING_ADDRESS:$CHROMIUM_REMOTE_DEBUGGING_PORT" >&2
  echo "flags: ${CHROMIUM_FLAGS[*]}" >&2
}

child_pid=""

stop_child() {
  if [ -n "$child_pid" ] && kill -0 "$child_pid" 2>/dev/null; then
    kill "$child_pid"
    wait "$child_pid" 2>/dev/null
  fi
  exit 0
}

trap stop_child INT TERM

CHROMIUM_FLAGS=(
  "--user-data-dir=$CHROMIUM_PROFILE_DIR"
  "--kiosk"
  "$KIOSK_URL"
  "--remote-debugging-address=$CHROMIUM_REMOTE_DEBUGGING_ADDRESS"
  "--remote-debugging-port=$CHROMIUM_REMOTE_DEBUGGING_PORT"
  "--start-fullscreen"
  "--no-first-run"
  "--no-default-browser-check"
  "--noerrdialogs"
  "--disable-search-engine-choice-screen"
  "--disable-infobars"
  "--disable-default-apps"
  "--disable-background-networking"
  "--disable-component-update"
  "--disable-domain-reliability"
  "--disable-gpu-rasterization"
  "--disable-zero-copy"
  "--disable-accelerated-video-decode"
  "--disable-features=TranslateUI,AutofillServerCommunication,PasswordManagerOnboarding,MediaRouter,AutofillAddressSavePrompt,AutofillCreditCardUpload,AutofillEnableAccountWalletStorage,InterestFeedContentSuggestions,SignInProfileCreation,OptimizationHints,SidePanelPinning"
  "--disable-notifications"
  "--disable-session-crashed-bubble"
  "--disable-signin-scoped-device-id"
  "--disable-sync"
  "--disable-translate"
  "--disable-save-password-bubble"
  "--disable-password-generation"
  "--deny-permission-prompts"
  "--hide-crash-restore-bubble"
  "--metrics-recording-only"
  "--no-service-autorun"
  "--password-store=basic"
  "--use-mock-keychain"
  "--autoplay-policy=no-user-gesture-required"
  "--check-for-update-interval=31536000"
)

log_kiosk_startup

while true; do
  "$CHROMIUM_BIN" "${CHROMIUM_FLAGS[@]}" &
  child_pid="$!"
  wait "$child_pid"
  exit_code="$?"
  echo "chromium kiosk exited with code $exit_code; restarting in ${RESTART_DELAY_SECONDS}s" >&2
  sleep "$RESTART_DELAY_SECONDS"
done
