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

usage() {
  cat <<'USAGE'
Usage: scripts/install.sh [options]

Interactive entry point for Narrowcasting appliance installation.

Options:
  --yes, -y                Use defaults for confirmations where possible.
  --dry-run                Print actions without changing the system.
  --skip-system-packages   Skip apt package installation.
  --help, -h               Show this help.

For direct/manual installs, use:
  scripts/install-server.sh
  scripts/install-player.sh --server-url http://SERVER-IP:3000 --start
USAGE
}

parse_args() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --yes|-y|--dry-run|--skip-system-packages)
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

require_installer_scripts() {
  require_repo_root
  [ -f "$ROOT_DIR/scripts/install-server.sh" ] || fatal "Missing installer: scripts/install-server.sh"
  [ -f "$ROOT_DIR/scripts/install-player.sh" ] || fatal "Missing installer: scripts/install-player.sh"
  [ -f "$ROOT_DIR/scripts/update-production.sh" ] || fatal "Missing updater: scripts/update-production.sh"
}

prompt_choice() {
  local prompt="$1"
  local answer

  printf '%s' "$prompt" >&2
  read -r answer
  printf '%s' "$answer"
}

prompt_server_url() {
  local default_url="${SERVER_URL:-http://localhost:3000}"
  local answer

  if [ "$YES" -eq 1 ]; then
    if [ "$default_url" = "http://localhost:3000" ]; then
      log_warning "No SERVER_URL was provided. Using $default_url, which is only correct when a server runs on this player."
    fi
    printf '%s' "$default_url"
    return
  fi

  printf 'Enter Narrowcasting server URL for this player [%s]: ' "$default_url" >&2
  read -r answer

  if [ -n "$answer" ]; then
    printf '%s' "$answer"
  else
    printf '%s' "$default_url"
  fi
}

prompt_start_after_install() {
  local answer

  if [ "$YES" -eq 1 ]; then
    return 0
  fi

  printf 'Start services after install? [Y/n] ' >&2
  read -r answer

  case "$answer" in
    n|N|no|NO)
      return 1
      ;;
    *)
      return 0
      ;;
  esac
}

run_existing_installer() {
  local installer="$1"
  shift

  ensure_executable "$ROOT_DIR/scripts/$installer"
  log_info "Running scripts/$installer $*"
  run_cmd "$ROOT_DIR/scripts/$installer" "$@"
}

install_server_appliance() {
  log_step "Server appliance"
  log_info "This installs the Narrowcasting server, dashboard, API, and production services."
  log_info "The existing server installer remains authoritative."

  local args=()
  [ "$YES" -eq 1 ] && args+=(--yes)
  [ "$DRY_RUN" -eq 1 ] && args+=(--dry-run)
  [ "$SKIP_SYSTEM_PACKAGES" -eq 1 ] && args+=(--skip-system-packages)

  if prompt_start_after_install; then
    args+=(--start)
  else
    args+=(--no-start)
  fi

  run_existing_installer install-server.sh "${args[@]}"
}

install_player_appliance() {
  log_step "Player appliance"
  log_info "This installs the dedicated Player appliance runtime and Agent."
  log_info "The existing player installer remains authoritative."

  local server_url
  server_url="$(prompt_server_url)"

  local args=(--server-url "$server_url")
  [ "$YES" -eq 1 ] && args+=(--yes)
  [ "$DRY_RUN" -eq 1 ] && args+=(--dry-run)
  [ "$SKIP_SYSTEM_PACKAGES" -eq 1 ] && args+=(--skip-system-packages)

  if prompt_start_after_install; then
    args+=(--start)
  else
    args+=(--no-start)
  fi

  run_existing_installer install-player.sh "${args[@]}"
}

chown_repo_to_current_user_if_needed() {
  if [ "$(id -u)" -eq 0 ]; then
    log_info "Running as root; repository ownership is left unchanged."
    return
  fi

  if [ ! -w "$ROOT_DIR" ]; then
    log_warning "Repository is not writable by current user. Attempting to update ownership for $ROOT_DIR."
    sudo_cmd chown -R "$(id -u):$(id -g)" "$ROOT_DIR"
  fi
}

pull_latest_code() {
  log_step "Pulling latest code"
  require_git_repo
  require_clean_update_state
  chown_repo_to_current_user_if_needed
  run_cmd git -C "$ROOT_DIR" pull --ff-only
}

restart_services() {
  local service

  reload_systemd
  for service in "$@"; do
    if systemctl cat "$service.service" >/dev/null 2>&1; then
      start_or_restart_service "$service"
      verify_service "$service"
    else
      log_warning "$service.service is not installed; restart skipped."
    fi
  done
}

restart_kiosk_if_available() {
  if systemctl cat narrowcasting-kiosk.service >/dev/null 2>&1; then
    start_or_restart_service narrowcasting-kiosk
    verify_service narrowcasting-kiosk
    return
  fi

  log_info "Kiosk is normally started by desktop autostart; no kiosk system service was found."
}

update_server() {
  log_step "Updating server components"
  npm_install_part server
  npm_install_part dashboard
  build_part server
  build_part dashboard
  restart_services narrowcasting-server
}

update_player() {
  log_step "Updating player components"
  npm_install_part agent
  npm_install_part player
  build_part agent
  build_part player
  restart_services narrowcasting-agent narrowcasting-player
  restart_kiosk_if_available
}

confirm_reboot_if_requested() {
  local answer

  printf 'Reboot this appliance now? [y/N] ' >&2
  read -r answer

  case "$answer" in
    y|Y|yes|YES)
    log_warning "Rebooting appliance by operator request."
    sudo_cmd reboot
      ;;
    *)
    log_info "Reboot skipped."
      ;;
  esac
}

update_installation() {
  log_step "Update existing installation"
  cat <<'MENU'
What should be updated?

1) Server
2) Player
3) Both
4) Cancel
MENU

  local update_choice
  update_choice="$(prompt_choice "Choose option [1-4]: ")"

  case "$update_choice" in
    1|2|3)
      require_linux
      require_systemd
      pull_latest_code
      install_node_runtime_if_needed
      require_node_runtime
      ;;
  esac

  case "$update_choice" in
    1)
      update_server
      ;;
    2)
      update_player
      ;;
    3)
      update_server
      update_player
      ;;
    4)
      log_info "Update cancelled."
      return
      ;;
    *)
      fatal "Unknown update option: $update_choice"
      ;;
  esac

  log_success "Update completed."
  confirm_reboot_if_requested
}

show_menu() {
  cat <<'MENU'
Narrowcasting Appliance Installer

Choose installation type:

1) Server appliance
2) Player appliance
3) Update existing installation
4) Exit
MENU
}

main() {
  parse_args "$@"
  require_installer_scripts

  show_menu
  local choice
  choice="$(prompt_choice "Choose option [1-4]: ")"

  case "$choice" in
    1)
      install_server_appliance
      ;;
    2)
      install_player_appliance
      ;;
    3)
      update_installation
      ;;
    4)
      log_info "Installer exited."
      ;;
    *)
      fatal "Unknown option: $choice"
      ;;
  esac
}

main "$@"
