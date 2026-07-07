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

TTY_WARNING_SHOWN=0

usage() {
  cat <<'USAGE'
Usage: scripts/install.sh [options]

Interactive entry point for Narrowcasting appliance installation and lifecycle management.

Options:
  --yes, -y                Use defaults for confirmations where possible.
  --server-url URL         Server URL for player installs; skips discovery.
  --dry-run                Print actions without changing the system.
  --skip-system-packages   Skip apt package installation.
  --help, -h               Show this help.

For direct/manual installs, use:
  scripts/install-server.sh
  scripts/install-player.sh --server-url http://SERVER-IP:3000 --start
  scripts/update-production.sh --start
USAGE
}

parse_args() {
  SERVER_URL="${SERVER_URL:-}"

  while [ "$#" -gt 0 ]; do
    case "$1" in
      --yes|-y|--dry-run|--skip-system-packages)
        parse_common_args "$1" || true
        ;;
      --server-url)
        [ "${2:-}" ] || fatal "--server-url requires a value."
        SERVER_URL="$2"
        shift
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

git_branch_or_unknown() {
  git -C "$ROOT_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || printf 'unknown\n'
}

git_commit_or_unknown() {
  git -C "$ROOT_DIR" rev-parse --short HEAD 2>/dev/null || printf 'unknown\n'
}

hostname_or_unknown() {
  hostname 2>/dev/null || printf 'unknown\n'
}

installer_summary_ip() {
  local ip_address
  ip_address="$(get_active_ipv4_address 2>/dev/null || true)"

  if [ -n "$ip_address" ]; then
    printf '%s' "$ip_address"
  else
    printf 'unknown'
  fi
}

service_or_config_detected() {
  local service_name="$1"
  local env_file="$2"

  if command -v systemctl >/dev/null 2>&1 && systemctl cat "$service_name.service" >/dev/null 2>&1; then
    return 0
  fi

  [ -f "$CONFIG_DIR/$env_file" ]
}

local_server_detected() {
  service_or_config_detected narrowcasting-server server.env
}

local_player_detected() {
  service_or_config_detected narrowcasting-player player.env || service_or_config_detected narrowcasting-agent agent.env
}

show_environment_summary() {
  local ip_address
  ip_address="$(installer_summary_ip)"
  local configured_server
  configured_server="$(read_existing_agent_server_url 2>/dev/null || true)"

  cat <<SUMMARY
----------------------------------------------------
Narrowcasting Appliance Manager

Repository:
$ROOT_DIR

Branch:
$(git_branch_or_unknown)

Commit:
$(git_commit_or_unknown)

Hostname:
$(hostname_or_unknown)

IP address:
$ip_address
SUMMARY

  if [ "$ip_address" != "unknown" ] && local_server_detected; then
    cat <<SUMMARY

Local Server dashboard:
http://$ip_address:3000
SUMMARY
  fi

  if [ "$ip_address" != "unknown" ] && local_player_detected; then
    cat <<SUMMARY

Local Player URL:
http://$ip_address:4174/player
SUMMARY
  fi

  if [ -n "$configured_server" ]; then
    cat <<SUMMARY

Configured Server:
$configured_server
SUMMARY
  fi

  cat <<'SUMMARY'
----------------------------------------------------
SUMMARY
}

prompt_choice() {
  local prompt="$1"
  local answer=""

  read_prompt answer "$prompt"
  printf '%s' "$answer"
}

read_prompt() {
  local result_var="$1"
  local prompt="${2:-}"
  local prompt_answer=""

  [ -n "$prompt" ] && printf '%s' "$prompt" >&2

  if { exec 3</dev/tty; } 2>/dev/null; then
    if IFS= read -r prompt_answer <&3; then
      :
    else
      prompt_answer=""
    fi
    exec 3<&-
  else
    if [ "$TTY_WARNING_SHOWN" -eq 0 ]; then
      printf 'WARNING /dev/tty is not available; interactive prompts will read from current stdin.\n' >&2
      TTY_WARNING_SHOWN=1
    fi

    if IFS= read -r prompt_answer; then
      :
    else
      prompt_answer=""
    fi
  fi

  prompt_answer="${prompt_answer%$'\r'}"
  printf -v "$result_var" '%s' "$prompt_answer"
}

get_active_ipv4_address() {
  local ip_address=""

  if command -v ip >/dev/null 2>&1; then
    ip_address="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{ for (i = 1; i <= NF; i++) { if ($i == "src") { print $(i + 1); exit } } }' || true)"
  fi

  if [ -z "$ip_address" ] && command -v hostname >/dev/null 2>&1; then
    ip_address="$(hostname -I 2>/dev/null | tr ' ' '\n' | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | grep -v '^127\.' | head -n 1 || true)"
  fi

  printf '%s' "$ip_address"
}

subnet_from_ipv4() {
  local ip_address="$1"
  printf '%s' "$ip_address" | awk -F. 'NF == 4 { printf "%s.%s.%s", $1, $2, $3 }'
}

is_narrowcasting_server() {
  local base_url="$1"
  local response=""

  command -v curl >/dev/null 2>&1 || return 1

  response="$(curl -fsS --connect-timeout 0.25 --max-time 0.6 "$base_url/api/status" 2>/dev/null || true)"
  if printf '%s' "$response" | grep -q '"application"[[:space:]]*:[[:space:]]*"Narrowcasting Server"'; then
    return 0
  fi

  response="$(curl -fsS --connect-timeout 0.25 --max-time 0.6 "$base_url/api/" 2>/dev/null || true)"
  if printf '%s' "$response" | grep -q '"service"[[:space:]]*:[[:space:]]*"narrowcasting-api"'; then
    return 0
  fi

  return 1
}

discover_narrowcasting_servers() {
  command -v curl >/dev/null 2>&1 || {
    printf 'WARNING curl is not available; server auto-discovery skipped.\n' >&2
    return 0
  }

  local ip_address
  ip_address="$(get_active_ipv4_address)"

  if [ -z "$ip_address" ]; then
    printf 'WARNING Could not determine active IPv4 address; server auto-discovery skipped.\n' >&2
    return 0
  fi

  local subnet
  subnet="$(subnet_from_ipv4 "$ip_address")"

  if [ -z "$subnet" ]; then
    printf 'WARNING Could not determine IPv4 subnet from %s; server auto-discovery skipped.\n' "$ip_address" >&2
    return 0
  fi

  printf 'INFO Scanning %s.0/24 for Narrowcasting Servers on port 3000...\n' "$subnet" >&2

  local temp_file
  temp_file="$(mktemp)"

  local host
  local running=0
  for host in $(seq 1 254); do
    (
      local candidate="http://$subnet.$host:3000"
      if is_narrowcasting_server "$candidate"; then
        printf '%s\n' "$candidate" >> "$temp_file"
      fi
    ) &

    running=$((running + 1))
    if [ "$running" -ge 32 ]; then
      wait
      running=0
    fi
  done

  wait

  sort -u "$temp_file"
  rm -f "$temp_file"
}

manual_server_url_prompt() {
  local default_url="${1:-http://localhost:3000}"
  local answer=""

  read_prompt answer "Enter Narrowcasting server URL for this player [$default_url]: "

  if [ -n "$answer" ]; then
    printf '%s' "$answer"
  else
    printf '%s' "$default_url"
  fi
}

select_discovered_server_url() {
  local -a candidates=("$@")
  local count="${#candidates[@]}"
  local answer=""

  if [ "$count" -eq 0 ]; then
    if [ "$YES" -eq 1 ]; then
      fatal "No Narrowcasting Server was discovered. Re-run with --server-url http://SERVER-IP:3000."
    fi

    printf 'INFO No Narrowcasting Server was found automatically.\n' >&2
    manual_server_url_prompt "http://localhost:3000"
    return
  fi

  if [ "$count" -eq 1 ]; then
    printf 'Found Narrowcasting Server:\n%s\n' "${candidates[0]}" >&2

    if [ "$YES" -eq 1 ]; then
      printf '%s' "${candidates[0]}"
      return
    fi

    read_prompt answer "Use this server? [Y/n] "
    case "$answer" in
      n|N|no|NO)
        manual_server_url_prompt "${candidates[0]}"
        ;;
      *)
        printf '%s' "${candidates[0]}"
        ;;
    esac
    return
  fi

  if [ "$YES" -eq 1 ]; then
    fatal "Multiple Narrowcasting Servers were discovered. Re-run with --server-url http://SERVER-IP:3000."
  fi

  printf 'Multiple Narrowcasting Servers found:\n' >&2
  local index=1
  local candidate
  for candidate in "${candidates[@]}"; do
    printf '%s) %s\n' "$index" "$candidate" >&2
    index=$((index + 1))
  done
  printf 'm) Enter manually\n' >&2

  while true; do
    read_prompt answer "Choose server [1-$count/m]: "

    if [ "$answer" = "m" ] || [ "$answer" = "M" ]; then
      manual_server_url_prompt "${candidates[0]}"
      return
    fi

    if printf '%s' "$answer" | grep -Eq '^[0-9]+$' && [ "$answer" -ge 1 ] && [ "$answer" -le "$count" ]; then
      printf '%s' "${candidates[$((answer - 1))]}"
      return
    fi

    printf 'Invalid selection.\n' >&2
  done
}

prompt_server_url() {
  if [ -n "${SERVER_URL:-}" ]; then
    printf 'INFO Using server URL from --server-url: %s\n' "$SERVER_URL" >&2
    printf '%s' "$SERVER_URL"
    return
  fi

  local discovered
  discovered="$(discover_narrowcasting_servers)"

  local -a candidates=()
  local candidate
  while IFS= read -r candidate; do
    [ -n "$candidate" ] && candidates+=("$candidate")
  done <<< "$discovered"

  select_discovered_server_url "${candidates[@]}"
}

read_existing_agent_server_url() {
  local file="$CONFIG_DIR/agent.env"

  if [ ! -f "$file" ]; then
    return 0
  fi

  if [ -r "$file" ]; then
    awk -F= '/^SERVER_URL=/{sub(/^SERVER_URL=/, ""); print; exit}' "$file"
    return 0
  fi

  if command -v sudo >/dev/null 2>&1; then
    sudo awk -F= '/^SERVER_URL=/{sub(/^SERVER_URL=/, ""); print; exit}' "$file" 2>/dev/null || true
  fi
}

prompt_repair_server_url() {
  if [ -n "${SERVER_URL:-}" ]; then
    printf 'INFO Using server URL from --server-url: %s\n' "$SERVER_URL" >&2
    printf '%s' "$SERVER_URL"
    return
  fi

  local existing_url
  existing_url="$(read_existing_agent_server_url)"

  if [ -n "$existing_url" ]; then
    if is_narrowcasting_server "$existing_url"; then
      printf 'Existing configured server found:\n%s\n' "$existing_url" >&2

      if [ "$YES" -eq 1 ]; then
        printf '%s' "$existing_url"
        return
      fi

      local answer=""
      read_prompt answer "Keep this server? [Y/n] "
      case "$answer" in
        n|N|no|NO)
          ;;
        *)
          printf '%s' "$existing_url"
          return
          ;;
      esac
    else
      printf 'WARNING Existing configured server is not reachable or is not a Narrowcasting Server: %s\n' "$existing_url" >&2
    fi
  else
    printf 'INFO No existing agent SERVER_URL configuration found.\n' >&2
  fi

  local discovered
  discovered="$(discover_narrowcasting_servers)"

  local -a candidates=()
  local candidate
  while IFS= read -r candidate; do
    [ -n "$candidate" ] && candidates+=("$candidate")
  done <<< "$discovered"

  select_discovered_server_url "${candidates[@]}"
}

prompt_start_after_install() {
  local answer=""

  if [ "$YES" -eq 1 ]; then
    return 0
  fi

  read_prompt answer "Start services after install? [Y/n] "

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

explicit_confirm() {
  local prompt="$1"
  local answer=""

  read_prompt answer "$prompt [y/N] "

  case "$answer" in
    y|Y|yes|YES)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
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

refresh_services_if_installed() {
  local service

  for service in "$@"; do
    refresh_installed_systemd_service "$service"
  done

  reload_systemd
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
  install_server_media_packages
  npm_install_part server
  npm_install_part dashboard
  build_part server
  build_part dashboard
  refresh_services_if_installed narrowcasting-server
  restart_services narrowcasting-server
}

update_player() {
  log_step "Updating player components"
  npm_install_part agent
  npm_install_part player
  build_part agent
  build_part player
  ensure_kiosk_env_readable_if_present
  refresh_services_if_installed narrowcasting-agent narrowcasting-player narrowcasting-kiosk
  restart_services narrowcasting-agent narrowcasting-player
  restart_kiosk_if_available
}

confirm_reboot_if_requested() {
  local answer=""

  read_prompt answer "Reboot this appliance now? [y/N] "

  case "$answer" in
    y|Y|yes|YES)
      log_info "Reboot initiated."
      if sudo_cmd reboot; then
        return
      fi
      log_error "Unable to reboot: reboot command failed."
      return 1
      ;;
    *)
      log_info "User chose not to reboot."
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

  local update_choice=""
  read_prompt update_choice "Choose option [1-4]: "

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

repair_server() {
  log_step "Repairing server appliance"
  log_info "Repair re-runs the authoritative server installer without removing user data."

  local args=(--yes --start)
  [ "$DRY_RUN" -eq 1 ] && args+=(--dry-run)
  [ "$SKIP_SYSTEM_PACKAGES" -eq 1 ] && args+=(--skip-system-packages)

  run_existing_installer install-server.sh "${args[@]}"
}

repair_player() {
  log_step "Repairing player appliance"
  log_info "Repair re-runs the authoritative player installer without removing identity, cache, or media."

  local server_url
  server_url="$(prompt_repair_server_url)"

  local args=(--yes --server-url "$server_url" --start)
  [ "$DRY_RUN" -eq 1 ] && args+=(--dry-run)
  [ "$SKIP_SYSTEM_PACKAGES" -eq 1 ] && args+=(--skip-system-packages)

  run_existing_installer install-player.sh "${args[@]}"
}

repair_installation() {
  log_step "Repair installation"
  cat <<'MENU'
What should be repaired?

1) Server
2) Player
3) Both
4) Cancel
MENU

  local repair_choice=""
  read_prompt repair_choice "Choose option [1-4]: "

  case "$repair_choice" in
    1|2|3)
      require_linux
      require_systemd
      chown_repo_to_current_user_if_needed
      install_node_runtime_if_needed
      require_node_runtime
      ;;
  esac

  case "$repair_choice" in
    1)
      repair_server
      ;;
    2)
      repair_player
      ;;
    3)
      repair_server
      repair_player
      ;;
    4)
      log_info "Repair cancelled."
      return
      ;;
    *)
      fatal "Unknown repair option: $repair_choice"
      ;;
  esac

  log_success "Repair completed."
}

remove_systemd_service_if_present() {
  local service_name="$1"
  local service_path="/etc/systemd/system/$service_name.service"

  if systemctl cat "$service_name.service" >/dev/null 2>&1; then
    log_info "Stopping and disabling $service_name.service"
    sudo_cmd systemctl stop "$service_name.service" || true
    sudo_cmd systemctl disable "$service_name.service" || true
  fi

  if [ -f "$service_path" ]; then
    log_info "Removing $service_path"
    sudo_cmd rm -f "$service_path"
  fi
}

remove_path_if_exists() {
  local path="$1"
  local label="$2"

  if [ -z "$path" ] || [ "$path" = "/" ]; then
    fatal "Refusing to remove unsafe path for $label: $path"
  fi

  if [ ! -e "$path" ]; then
    log_info "No $label found at $path"
    return
  fi

  log_info "Removing $label at $path"
  sudo_cmd rm -rf "$path"
}

soft_uninstall_server() {
  log_step "Soft uninstall server components"
  remove_systemd_service_if_present narrowcasting-server
  remove_path_if_exists "$ROOT_DIR/server/node_modules" "server node_modules"
  remove_path_if_exists "$ROOT_DIR/server/dist" "server production build"
  remove_path_if_exists "$ROOT_DIR/dashboard/node_modules" "dashboard node_modules"
  remove_path_if_exists "$ROOT_DIR/dashboard/dist" "dashboard production build"
}

soft_uninstall_player() {
  log_step "Soft uninstall player components"
  remove_systemd_service_if_present narrowcasting-agent
  remove_systemd_service_if_present narrowcasting-player
  remove_systemd_service_if_present narrowcasting-kiosk
  remove_path_if_exists "/etc/xdg/autostart/narrowcasting-kiosk.desktop" "kiosk desktop autostart"
  remove_path_if_exists "$ROOT_DIR/agent/node_modules" "agent node_modules"
  remove_path_if_exists "$ROOT_DIR/agent/dist" "agent production build"
  remove_path_if_exists "$ROOT_DIR/player/node_modules" "player node_modules"
  remove_path_if_exists "$ROOT_DIR/player/dist" "player production build"
  remove_path_if_exists "$ROOT_DIR/player/.vite" "player temporary cache"
}

full_uninstall_server_data() {
  log_step "Removing server application data"
  remove_path_if_exists "$ROOT_DIR/server/data" "server data"
  remove_path_if_exists "$ROOT_DIR/server/public/media" "server media"
  remove_path_if_exists "$ROOT_DIR/logs/server" "server logs"
}

full_uninstall_player_data() {
  log_step "Removing player application data"
  remove_path_if_exists "$ROOT_DIR/player/public/data" "player schedule/cache data"
  remove_path_if_exists "$ROOT_DIR/player/public/media" "player media cache"
  remove_path_if_exists "$ROOT_DIR/player/chromium-kiosk-profile" "Chromium kiosk profile"
  remove_path_if_exists "$ROOT_DIR/logs/player" "player logs"
  remove_path_if_exists "$ROOT_DIR/logs/agent" "agent logs"
  remove_path_if_exists "$ROOT_DIR/logs/kiosk" "kiosk logs"
}

confirm_full_uninstall() {
  local answer=""

  read_prompt answer "Remove all application data as well? Type YES to continue: "

  if [ "$answer" != "YES" ]; then
    return 1
  fi

  read_prompt answer "Type REMOVE to confirm full uninstall: "
  [ "$answer" = "REMOVE" ]
}

maybe_remove_configuration() {
  if explicit_confirm "Remove /etc/narrowcasting configuration?"; then
    remove_path_if_exists "$CONFIG_DIR" "Narrowcasting configuration"
  else
    log_info "Configuration preserved at $CONFIG_DIR"
  fi
}

maybe_remove_repository() {
  if explicit_confirm "Remove the repository directory $ROOT_DIR?"; then
    log_warning "Removing repository directory by explicit operator request."
    sudo_cmd rm -rf "$ROOT_DIR"
  else
    log_info "Repository preserved at $ROOT_DIR"
  fi
}

uninstall_selection() {
  local target="$1"
  local full=0

  case "$target" in
    player)
      explicit_confirm "Soft uninstall Player components?" || {
        log_info "Uninstall cancelled."
        return
      }
      soft_uninstall_player
      if confirm_full_uninstall; then
        full=1
        full_uninstall_player_data
      fi
      ;;
    server)
      explicit_confirm "Soft uninstall Server components?" || {
        log_info "Uninstall cancelled."
        return
      }
      soft_uninstall_server
      if confirm_full_uninstall; then
        full=1
        full_uninstall_server_data
      fi
      ;;
    everything)
      explicit_confirm "Soft uninstall Server and Player components?" || {
        log_info "Uninstall cancelled."
        return
      }
      soft_uninstall_player
      soft_uninstall_server
      if confirm_full_uninstall; then
        full=1
        full_uninstall_player_data
        full_uninstall_server_data
      fi
      ;;
    *)
      fatal "Unknown uninstall target: $target"
      ;;
  esac

  if [ "$full" -eq 1 ]; then
    maybe_remove_configuration
    maybe_remove_repository
  else
    log_info "Soft uninstall completed. Media, schedules, campaigns, playlists, programs, assignments, configuration, and runtime data were preserved."
  fi

  reload_systemd
  log_success "Uninstall completed."
}

uninstall_installation() {
  log_step "Uninstall"
  log_warning "Uninstall is destructive. It always requires explicit confirmation."
  cat <<'MENU'
What should be uninstalled?

1) Player only
2) Server only
3) Everything
4) Cancel
MENU

  local uninstall_choice=""
  read_prompt uninstall_choice "Choose option [1-4]: "

  case "$uninstall_choice" in
    1|2|3)
      require_linux
      require_systemd
      ;;
  esac

  case "$uninstall_choice" in
    1)
      uninstall_selection player
      ;;
    2)
      uninstall_selection server
      ;;
    3)
      uninstall_selection everything
      ;;
    4)
      log_info "Uninstall cancelled."
      ;;
    *)
      fatal "Unknown uninstall option: $uninstall_choice"
      ;;
  esac
}

show_menu() {
  cat <<'MENU'
Narrowcasting Appliance Manager

1) Install Server
2) Install Player
3) Update Installation
4) Repair Installation
5) Uninstall
6) Exit
MENU
}

main() {
  parse_args "$@"
  require_installer_scripts

  show_environment_summary
  show_menu
  local choice=""
  read_prompt choice "Choose option [1-6]: "

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
      repair_installation
      ;;
    5)
      uninstall_installation
      ;;
    6)
      log_info "Appliance Manager exited."
      ;;
    *)
      fatal "Unknown option: $choice"
      ;;
  esac
}

main "$@"
