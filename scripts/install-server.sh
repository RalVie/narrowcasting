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

INSTALL_AGENT=1
INSTALL_PLAYER_SERVICE=1

usage() {
  cat <<'USAGE'
Usage: scripts/install-server.sh [options]

Options:
  --yes, -y                Do not prompt for confirmations.
  --dry-run                Print actions without changing the system.
  --start                  Start/restart installed services after install.
  --no-start               Do not start services after install.
  --skip-system-packages   Skip apt package installation.
  --no-agent               Do not install/enable the agent service.
  --no-player-service      Do not install/enable the player static server service.
  --help, -h               Show this help.

Environment:
  NARROWCASTING_ROOT, NARROWCASTING_SERVICE_USER, NARROWCASTING_ADMIN_KEY,
  NARROWCASTING_CONFIG_DIR.
USAGE
}

parse_args() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --no-agent)
        INSTALL_AGENT=0
        ;;
      --no-player-service)
        INSTALL_PLAYER_SERVICE=0
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

admin_key_for_config() {
  if [ -n "${NARROWCASTING_ADMIN_KEY:-}" ]; then
    printf '%s\n' "$NARROWCASTING_ADMIN_KEY"
    return
  fi

  if [ "$YES" -eq 1 ]; then
    random_secret
    return
  fi

  printf 'Enter admin key for dashboard/API management, or leave empty to generate one: '
  read -r entered_key
  if [ -n "$entered_key" ]; then
    printf '%s\n' "$entered_key"
  else
    random_secret
  fi
}

create_runtime_directories() {
  log_step "Creating production directories"
  ensure_dir "$ROOT_DIR/server/data"
  ensure_dir "$ROOT_DIR/server/public/media"
  ensure_dir "$ROOT_DIR/player/public/data"
  ensure_dir "$ROOT_DIR/player/public/media"
  ensure_dir "$ROOT_DIR/logs/server"
  ensure_dir "$ROOT_DIR/logs/agent"
  ensure_dir "$ROOT_DIR/logs/player"
  ensure_dir "$ROOT_DIR/logs/kiosk"
}

create_default_config() {
  log_step "Creating default configuration if absent"
  local admin_key
  admin_key="$(admin_key_for_config)"

  install_env_file_if_absent "server.env" "NODE_ENV=production
HOST=0.0.0.0
PORT=3000
NARROWCASTING_ADMIN_KEY=$admin_key
NARROWCASTING_CORS_ORIGIN="

  install_env_file_if_absent "agent.env" "SERVER_URL=http://localhost:3000
CACHE_DIR=../player/public/data
MEDIA_DIR=../player/public/media
STATUS_PATH=../server/data/agent-status.json
SYNC_INTERVAL_MS=30000
HEARTBEAT_INTERVAL_MS=15000"

  install_env_file_if_absent "player.env" "PLAYER_HOST=0.0.0.0
PLAYER_PORT=4174"
}

prepare_runtime_scripts() {
  log_step "Preparing runtime start scripts"
  ensure_executable "$ROOT_DIR/scripts/start-server.sh"
  ensure_executable "$ROOT_DIR/scripts/start-agent.sh"
  ensure_executable "$ROOT_DIR/scripts/start-player.sh"
  ensure_executable "$ROOT_DIR/scripts/start-kiosk.sh"
}

install_services() {
  log_step "Installing systemd services"
  install_systemd_service narrowcasting-server

  if [ "$INSTALL_AGENT" -eq 1 ]; then
    install_systemd_service narrowcasting-agent
  fi

  if [ "$INSTALL_PLAYER_SERVICE" -eq 1 ]; then
    install_systemd_service narrowcasting-player
  fi

  reload_systemd

  enable_service narrowcasting-server
  [ "$INSTALL_AGENT" -eq 0 ] || enable_service narrowcasting-agent
  [ "$INSTALL_PLAYER_SERVICE" -eq 0 ] || enable_service narrowcasting-player

  if [ "$START_SERVICES" -eq 1 ]; then
    start_or_restart_service narrowcasting-server
    [ "$INSTALL_AGENT" -eq 0 ] || start_or_restart_service narrowcasting-agent
    [ "$INSTALL_PLAYER_SERVICE" -eq 0 ] || start_or_restart_service narrowcasting-player
  fi
}

verify_installation() {
  log_step "Verifying installation"
  verify_service narrowcasting-server
  [ "$INSTALL_AGENT" -eq 0 ] || verify_service narrowcasting-agent
  [ "$INSTALL_PLAYER_SERVICE" -eq 0 ] || verify_service narrowcasting-player
}

parse_args "$@"

log_step "Installing Narrowcasting server appliance"
require_linux
warn_if_not_raspberry_pi
require_repo_root
require_systemd
install_system_packages
install_node_runtime_if_needed
require_node_runtime
npm_install_all
build_all
create_runtime_directories
create_default_config
prepare_runtime_scripts
install_services
verify_installation

log_success "Narrowcasting server installation complete"
log_info "Dashboard/API: http://$(hostname -I 2>/dev/null | awk '{print $1}' || echo PI-IP):3000/"
log_info "Player server: http://localhost:4174/player"
