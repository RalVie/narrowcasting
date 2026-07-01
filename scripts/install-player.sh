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

usage() {
  cat <<'USAGE'
Usage: scripts/install-player.sh [options]

Options:
  --yes, -y                Do not prompt for confirmations.
  --dry-run                Print actions without changing the system.
  --start                  Start/restart installed services after install.
  --no-start               Do not start services after install.
  --skip-system-packages   Skip apt package installation.
  --no-kiosk               Do not install/enable the Chromium kiosk service.
  --help, -h               Show this help.

Environment:
  NARROWCASTING_ROOT, NARROWCASTING_SERVICE_USER, PLAYER_PORT, KIOSK_URL.
USAGE
}

parse_args() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --no-kiosk)
        INSTALL_KIOSK=0
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
  ensure_dir "$ROOT_DIR/logs/player"
  ensure_dir "$ROOT_DIR/logs/kiosk"
}

create_player_config() {
  log_step "Creating player configuration if absent"
  install_env_file_if_absent "player.env" "PLAYER_HOST=0.0.0.0
PLAYER_PORT=${PLAYER_PORT:-4174}"
  install_env_file_if_absent "kiosk.env" "KIOSK_URL=${KIOSK_URL:-http://localhost:4174/player}
DISPLAY=${DISPLAY:-:0}"
}

install_player_services() {
  log_step "Installing player systemd services"
  install_systemd_service narrowcasting-player

  if [ "$INSTALL_KIOSK" -eq 1 ]; then
    install_systemd_service narrowcasting-kiosk
  else
    log_warning "Kiosk service installation skipped."
  fi

  reload_systemd

  enable_service narrowcasting-player
  [ "$INSTALL_KIOSK" -eq 0 ] || enable_service narrowcasting-kiosk

  if [ "$START_SERVICES" -eq 1 ]; then
    start_or_restart_service narrowcasting-player
    [ "$INSTALL_KIOSK" -eq 0 ] || start_or_restart_service narrowcasting-kiosk
  fi
}

verify_player_installation() {
  log_step "Verifying player installation"
  verify_service narrowcasting-player
  [ "$INSTALL_KIOSK" -eq 0 ] || verify_service narrowcasting-kiosk
  [ -d "$ROOT_DIR/player/public/media" ] || fatal "Player media cache directory is missing."
  [ -d "$ROOT_DIR/player/public/data" ] || fatal "Player data cache directory is missing."
}

parse_args "$@"

log_step "Installing Narrowcasting player appliance"
require_linux
warn_if_not_raspberry_pi
require_repo_root
require_node_runtime
require_systemd
install_player_system_packages
npm_install_part player
build_part player
create_player_directories
create_player_config
install_player_services
verify_player_installation

log_success "Narrowcasting player installation complete"
log_info "Player URL: http://localhost:${PLAYER_PORT:-4174}/player"
log_info "Existing player identity, media cache, and schedule cache were preserved."
