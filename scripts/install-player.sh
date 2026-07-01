#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
. "$SCRIPT_DIR/lib/common.sh"
# shellcheck source=lib/validation.sh
. "$SCRIPT_DIR/lib/validation.sh"
# shellcheck source=lib/packages.sh
. "$SCRIPT_DIR/lib/packages.sh"
# shellcheck source=lib/systemd.sh
. "$SCRIPT_DIR/lib/systemd.sh"

INSTALL_KIOSK=1
SERVER_URL_OPTION="${SERVER_URL:-}"

usage() {
  cat <<'USAGE'
Usage: scripts/install-player.sh [options]

Options:
  --yes, -y                Do not prompt for confirmations.
  --dry-run                Print actions without changing the system.
  --start                  Start/restart installed services after install.
  --no-start               Do not start services after install.
  --skip-system-packages   Skip apt package installation.
  --no-kiosk               Do not install Chromium kiosk desktop autostart.
  --server-url <url>       Server URL for the agent, for example http://SERVER-IP:3000.
  --help, -h               Show this help.

Environment:
  NARROWCASTING_ROOT, NARROWCASTING_SERVICE_USER, SERVER_URL, PLAYER_PORT,
  KIOSK_URL.
USAGE
}

parse_args() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --no-kiosk)
        INSTALL_KIOSK=0
        ;;
      --server-url)
        shift
        [ "$#" -gt 0 ] || fatal "--server-url requires a URL value."
        SERVER_URL_OPTION="$1"
        ;;
      --yes|-y|--dry-run|--start|--no-start|--skip-system-packages)
        parse_common_args "$1" || true
        ;;
      --help|-h)
        usage
        exit 0
        ;;
      *)
        fatal "Unknown option: $1"
        ;;
    esac
    shift
  done
}

create_player_directories() {
  log_step "Preparing player runtime directories"
  ensure_dir "$ROOT_DIR/player/public/data"
  ensure_dir "$ROOT_DIR/player/public/media"
  ensure_dir "$ROOT_DIR/logs/agent"
  ensure_dir "$ROOT_DIR/logs/player"
  ensure_dir "$ROOT_DIR/logs/kiosk"
}

read_existing_agent_server_url() {
  local file="$CONFIG_DIR/agent.env"
  [ -f "$file" ] || return 1

  if [ -r "$file" ]; then
    awk -F= '/^SERVER_URL=/{sub(/^SERVER_URL=/, ""); print; exit}' "$file"
    return
  fi

  if [ "$(id -u)" -eq 0 ]; then
    awk -F= '/^SERVER_URL=/{sub(/^SERVER_URL=/, ""); print; exit}' "$file"
    return
  fi

  if command -v sudo >/dev/null 2>&1; then
    sudo awk -F= '/^SERVER_URL=/{sub(/^SERVER_URL=/, ""); print; exit}' "$file" 2>/dev/null || true
  fi
}

resolve_agent_server_url() {
  local result_var="$1"

  if [ -n "$SERVER_URL_OPTION" ]; then
    printf -v "$result_var" '%s' "$SERVER_URL_OPTION"
    return
  fi

  local default_url
  default_url="http://localhost:3000"

  if [ "$YES" -eq 1 ]; then
    log_warning "No --server-url was provided. Using default SERVER_URL=$default_url, which is only correct when a server runs on this player."
    printf -v "$result_var" '%s' "$default_url"
    return
  fi

  printf 'Enter Narrowcasting server URL for this player [%s]: ' "$default_url"
  read -r entered_url
  if [ -n "$entered_url" ]; then
    printf -v "$result_var" '%s' "$entered_url"
  else
    log_warning "Using default SERVER_URL=$default_url. Dedicated players normally need http://SERVER-IP:3000."
    printf -v "$result_var" '%s' "$default_url"
  fi
}

create_agent_config() {
  local agent_env_path
  agent_env_path="$CONFIG_DIR/agent.env"

  if [ -f "$agent_env_path" ]; then
    local current_url
    current_url="$(read_existing_agent_server_url)"
    log_info "Preserving existing $agent_env_path"
    if [ -n "$current_url" ]; then
      log_info "Configured agent SERVER_URL: $current_url"
    else
      log_warning "Could not read SERVER_URL from $agent_env_path"
    fi
    if [ -n "$SERVER_URL_OPTION" ]; then
      log_warning "--server-url was provided but $agent_env_path already exists, so it was not overwritten."
    fi
    log_info "To change it later, edit $agent_env_path or run: sudo sed -i 's#^SERVER_URL=.*#SERVER_URL=http://SERVER-IP:3000#' $agent_env_path"
    return
  fi

  local agent_server_url
  resolve_agent_server_url agent_server_url

  install_env_file_if_absent "agent.env" "SERVER_URL=$agent_server_url
CACHE_DIR=../player/public/data
MEDIA_DIR=../player/public/media
REGISTRATION_PATH=../player/public/data/player-registration.json
STATUS_PATH=../player/public/data/agent-status.json
SYNC_INTERVAL_MS=30000
HEARTBEAT_INTERVAL_MS=15000"
}

create_player_config() {
  log_step "Creating player configuration if absent"
  install_env_file_if_absent "player.env" "PLAYER_HOST=0.0.0.0
PLAYER_PORT=${PLAYER_PORT:-4174}"
  create_agent_config
  install_env_file_if_absent "kiosk.env" "KIOSK_URL=${KIOSK_URL:-http://localhost:4174/player}
RESTART_DELAY_SECONDS=10"
}

prepare_runtime_scripts() {
  log_step "Preparing runtime start scripts"
  ensure_executable "$ROOT_DIR/scripts/start-player.sh"
  ensure_executable "$ROOT_DIR/scripts/start-agent.sh"
  ensure_executable "$ROOT_DIR/scripts/start-kiosk.sh"
}

install_kiosk_autostart() {
  if [ "$INSTALL_KIOSK" -eq 0 ]; then
    log_warning "Kiosk autostart installation skipped."
    return
  fi

  log_step "Installing kiosk desktop autostart"

  if [ ! -d /etc/xdg/autostart ] && [ ! -d /usr/share/wayland-sessions ] && [ ! -d /usr/share/xsessions ]; then
    log_warning "No graphical desktop session was detected. Kiosk autostart is skipped on OS Lite."
    return
  fi

  local template_path
  local rendered
  template_path="$ROOT_DIR/deployment/autostart/narrowcasting-kiosk.desktop"
  [ -f "$template_path" ] || fatal "Kiosk autostart template not found: $template_path"
  rendered="$(mktemp)"
  sed \
    -e "s#/opt/narrowcasting#$ROOT_DIR#g" \
    "$template_path" > "$rendered"
  sudo_cmd mkdir -p /etc/xdg/autostart
  sudo_cmd install -m 0644 "$rendered" /etc/xdg/autostart/narrowcasting-kiosk.desktop
  rm -f "$rendered"
  log_success "Installed kiosk desktop autostart"
}

install_player_services() {
  log_step "Installing player and agent systemd services"
  install_systemd_service narrowcasting-agent
  install_systemd_service narrowcasting-player

  reload_systemd

  enable_service narrowcasting-agent
  enable_service narrowcasting-player

  if [ "$START_SERVICES" -eq 1 ]; then
    start_or_restart_service narrowcasting-agent
    start_or_restart_service narrowcasting-player
  fi
}

verify_player_installation() {
  log_step "Verifying player installation"
  verify_service narrowcasting-agent
  verify_service narrowcasting-player
  [ -d "$ROOT_DIR/player/public/media" ] || fatal "Player media cache directory is missing."
  [ -d "$ROOT_DIR/player/public/data" ] || fatal "Player data cache directory is missing."
  if [ "$INSTALL_KIOSK" -eq 1 ] && [ -f /etc/xdg/autostart/narrowcasting-kiosk.desktop ]; then
    log_success "Kiosk desktop autostart is installed"
  elif [ "$INSTALL_KIOSK" -eq 1 ]; then
    log_warning "Kiosk desktop autostart is not installed. This is expected on OS Lite without a graphical session."
  fi
}

parse_args "$@"

log_step "Installing Narrowcasting player appliance"
require_linux
warn_if_not_raspberry_pi
require_repo_root
require_systemd
install_player_system_packages
install_node_runtime_if_needed
require_node_runtime
npm_install_part player
npm_install_part agent
build_part player
build_part agent
create_player_directories
create_player_config
prepare_runtime_scripts
install_player_services
install_kiosk_autostart
verify_player_installation

log_success "Narrowcasting player installation complete"
log_info "Player URL: http://localhost:${PLAYER_PORT:-4174}/player"
log_info "Agent sync service is installed and uses the player cache directories."
log_info "Kiosk uses desktop autostart and starts after graphical login when a desktop session is available."
log_info "Existing player identity, registration, media cache, and schedule cache were preserved."
