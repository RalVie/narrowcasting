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

RUN_GIT_PULL=1

usage() {
  cat <<'USAGE'
Usage: scripts/update-production.sh [options]

Options:
  --yes, -y                Do not prompt for confirmations.
  --dry-run                Print actions without changing the system.
  --start                  Restart active services after update.
  --no-start               Do not restart services after update.
  --skip-system-packages   Skip apt package installation.
  --no-git-pull            Skip git pull.
  --help, -h               Show this help.

Environment:
  NARROWCASTING_ROOT, NARROWCASTING_BACKUP_DIR, ALLOW_DIRTY_UPDATE=1.
USAGE
}

parse_args() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --no-git-pull)
        RUN_GIT_PULL=0
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

backup_path_if_exists() {
  local source_path="$1"
  local backup_root="$2"
  local label="$3"

  if [ ! -e "$source_path" ]; then
    log_info "No $label found at $source_path"
    return
  fi

  ensure_dir "$backup_root"
  local target="$backup_root/$label.tar.gz"
  log_info "Backing up $source_path to $target"
  run_cmd tar -czf "$target" -C "$(dirname "$source_path")" "$(basename "$source_path")"
}

backup_runtime_data() {
  log_step "Backing up configuration and runtime data"
  require_command tar

  local stamp
  stamp="$(date +%Y%m%d-%H%M%S)"
  local backup_root="$BACKUP_DIR/$stamp"

  backup_path_if_exists "$ROOT_DIR/server/data" "$backup_root" "server-data"
  backup_path_if_exists "$ROOT_DIR/server/public/media" "$backup_root" "server-media"
  backup_path_if_exists "$ROOT_DIR/player/public/data" "$backup_root" "player-data"
  backup_path_if_exists "$ROOT_DIR/player/public/media" "$backup_root" "player-media"

  if [ -d "$CONFIG_DIR" ]; then
    backup_path_if_exists "$CONFIG_DIR" "$backup_root" "config"
  fi

  log_success "Backup complete: $backup_root"
}

pull_latest_code() {
  if [ "$RUN_GIT_PULL" -eq 0 ]; then
    log_info "Skipping git pull."
    return
  fi

  log_step "Pulling latest code"
  run_cmd git -C "$ROOT_DIR" pull --ff-only
}

restart_known_services() {
  if [ "$START_SERVICES" -ne 1 ]; then
    log_info "Service restart skipped. Use --start to restart after update."
    return
  fi

  log_step "Restarting installed services"
  for service in narrowcasting-server narrowcasting-agent narrowcasting-player narrowcasting-kiosk; do
    if systemctl cat "$service.service" >/dev/null 2>&1; then
      start_or_restart_service "$service"
    fi
  done
}

verify_known_services() {
  log_step "Verifying installed services"
  for service in narrowcasting-server narrowcasting-agent narrowcasting-player narrowcasting-kiosk; do
    if systemctl cat "$service.service" >/dev/null 2>&1; then
      verify_service "$service"
    fi
  done
}

parse_args "$@"

log_step "Updating Narrowcasting production installation"
require_linux
require_repo_root
require_git_repo
require_clean_update_state
require_node_runtime
require_systemd
backup_runtime_data
pull_latest_code
install_system_packages
npm_install_all
build_all
reload_systemd
restart_known_services
verify_known_services

log_success "Narrowcasting production update complete"
