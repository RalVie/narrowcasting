#!/usr/bin/env bash

if [ -z "${BASH_VERSION:-}" ]; then
  echo "These scripts require bash." >&2
  exit 1
fi

SCRIPT_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="${NARROWCASTING_ROOT:-$(cd "$SCRIPT_LIB_DIR/../.." && pwd)}"
CONFIG_DIR="${NARROWCASTING_CONFIG_DIR:-/etc/narrowcasting}"
BACKUP_DIR="${NARROWCASTING_BACKUP_DIR:-$ROOT_DIR/backups}"
SERVICE_USER="${NARROWCASTING_SERVICE_USER:-${USER:-pi}}"
YES=0
DRY_RUN=0
START_SERVICES=0
SKIP_SYSTEM_PACKAGES=0

if [ -t 1 ] && command -v tput >/dev/null 2>&1; then
  COLOR_STEP="$(tput bold)"
  COLOR_SUCCESS="$(tput setaf 2)"
  COLOR_WARNING="$(tput setaf 3)"
  COLOR_ERROR="$(tput setaf 1)"
  COLOR_RESET="$(tput sgr0)"
else
  COLOR_STEP=""
  COLOR_SUCCESS=""
  COLOR_WARNING=""
  COLOR_ERROR=""
  COLOR_RESET=""
fi

log_step() {
  printf '%sSTEP%s %s\n' "$COLOR_STEP" "$COLOR_RESET" "$*"
}

log_info() {
  printf 'INFO %s\n' "$*"
}

log_success() {
  printf '%sSUCCESS%s %s\n' "$COLOR_SUCCESS" "$COLOR_RESET" "$*"
}

log_warning() {
  printf '%sWARNING%s %s\n' "$COLOR_WARNING" "$COLOR_RESET" "$*"
}

log_error() {
  printf '%sERROR%s %s\n' "$COLOR_ERROR" "$COLOR_RESET" "$*" >&2
}

fatal() {
  log_error "$*"
  exit 1
}

parse_common_args() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --yes|-y)
        YES=1
        ;;
      --dry-run)
        DRY_RUN=1
        ;;
      --start)
        START_SERVICES=1
        ;;
      --no-start)
        START_SERVICES=0
        ;;
      --skip-system-packages)
        SKIP_SYSTEM_PACKAGES=1
        ;;
      --help|-h)
        return 2
        ;;
      *)
        return 1
        ;;
    esac
    shift
  done
  return 0
}

confirm() {
  local prompt="$1"

  if [ "$YES" -eq 1 ]; then
    return 0
  fi

  printf '%s [y/N] ' "$prompt"
  read -r answer
  case "$answer" in
    y|Y|yes|YES)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

run_cmd() {
  if [ "$DRY_RUN" -eq 1 ]; then
    printf 'INFO dry-run:'
    printf ' %q' "$@"
    printf '\n'
    return 0
  fi

  "$@"
}

sudo_cmd() {
  if [ "$(id -u)" -eq 0 ]; then
    run_cmd "$@"
    return
  fi

  command -v sudo >/dev/null 2>&1 || fatal "sudo is required for this operation. Re-run as root or install sudo."
  run_cmd sudo "$@"
}

ensure_dir() {
  local path="$1"
  run_cmd mkdir -p "$path"
}

ensure_executable() {
  local path="$1"
  [ -f "$path" ] || fatal "Required executable file is missing: $path"
  run_cmd chmod +x "$path"
}

write_file_if_absent() {
  local path="$1"
  local content="$2"
  local mode="${3:-0644}"
  local owner="${4:-}"

  if [ -f "$path" ]; then
    log_info "Preserving existing $path"
    return
  fi

  local temp_file
  temp_file="$(mktemp)"
  printf '%s\n' "$content" > "$temp_file"
  if [ -n "$owner" ]; then
    sudo_cmd install -m "$mode" -o "$owner" -g "$owner" "$temp_file" "$path"
  else
    sudo_cmd install -m "$mode" "$temp_file" "$path"
  fi
  rm -f "$temp_file"
}

random_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
    return
  fi

  if [ -r /dev/urandom ]; then
    od -An -N32 -tx1 /dev/urandom | tr -d ' \n'
    printf '\n'
    return
  fi

  date +%s%N
}
