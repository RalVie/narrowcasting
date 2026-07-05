#!/usr/bin/env bash
set -euo pipefail

DEFAULT_REPO_URL="https://github.com/RalVie/narrowcasting.git"
DEFAULT_TARGET_DIR="$HOME/narrowcasting"

REPO_URL="$DEFAULT_REPO_URL"
TARGET_DIR="$DEFAULT_TARGET_DIR"
BRANCH=""
PASS_YES=0

log_step() {
  printf 'STEP %s\n' "$*"
}

log_info() {
  printf 'INFO %s\n' "$*"
}

log_warning() {
  printf 'WARN %s\n' "$*"
}

log_error() {
  printf 'ERROR %s\n' "$*" >&2
}

fatal() {
  log_error "$*"
  exit 1
}

usage() {
  cat <<'USAGE'
Usage: scripts/bootstrap.sh [options]

Bootstrap a fresh Raspberry Pi/Linux host by installing minimal prerequisites,
cloning or updating the Narrowcasting repository, and starting scripts/install.sh.

Options:
  --repo URL       Repository URL to clone. Default: https://github.com/RalVie/narrowcasting.git
  --target PATH    Target checkout directory. Default: ~/narrowcasting
  --branch BRANCH  Branch to clone or update.
  --yes, -y        Pass --yes to scripts/install.sh.
  --help, -h       Show this help.
USAGE
}

parse_args() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --repo)
        [ "${2:-}" ] || fatal "--repo requires a value."
        REPO_URL="$2"
        shift
        ;;
      --target)
        [ "${2:-}" ] || fatal "--target requires a value."
        TARGET_DIR="$2"
        shift
        ;;
      --branch)
        [ "${2:-}" ] || fatal "--branch requires a value."
        BRANCH="$2"
        shift
        ;;
      --yes|-y)
        PASS_YES=1
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

expand_target_dir() {
  case "$TARGET_DIR" in
    "~")
      TARGET_DIR="$HOME"
      ;;
    "~/"*)
      TARGET_DIR="$HOME/${TARGET_DIR#~/}"
      ;;
  esac
}

sudo_cmd() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
    return
  fi

  command -v sudo >/dev/null 2>&1 || fatal "sudo is required to install prerequisites. Install git/curl manually and rerun."
  sudo "$@"
}

install_prerequisites_with_apt() {
  local -a missing=("$@")

  command -v apt-get >/dev/null 2>&1 || fatal "Missing required command(s): ${missing[*]}. Install them manually and rerun."

  log_step "Installing minimal prerequisites"
  log_info "Installing: ${missing[*]}"
  sudo_cmd apt-get update
  sudo_cmd apt-get install -y "${missing[@]}"
}

ensure_minimal_prerequisites() {
  local -a missing=()

  command -v git >/dev/null 2>&1 || missing+=(git)
  command -v curl >/dev/null 2>&1 || missing+=(curl)

  if [ "${#missing[@]}" -eq 0 ]; then
    log_info "Minimal prerequisites already installed."
    return
  fi

  install_prerequisites_with_apt "${missing[@]}"
}

clone_repository() {
  log_step "Cloning Narrowcasting repository"
  log_info "Repository: $REPO_URL"
  log_info "Target: $TARGET_DIR"

  mkdir -p "$(dirname "$TARGET_DIR")"

  if [ -n "$BRANCH" ]; then
    git clone --branch "$BRANCH" "$REPO_URL" "$TARGET_DIR"
  else
    git clone "$REPO_URL" "$TARGET_DIR"
  fi
}

update_existing_repository() {
  log_step "Updating existing Narrowcasting repository"

  if [ -n "$BRANCH" ]; then
    git -C "$TARGET_DIR" fetch origin "$BRANCH"
    git -C "$TARGET_DIR" checkout "$BRANCH"
    git -C "$TARGET_DIR" pull --ff-only origin "$BRANCH"
  else
    git -C "$TARGET_DIR" pull --ff-only
  fi
}

prepare_repository() {
  if [ -e "$TARGET_DIR" ] && [ ! -d "$TARGET_DIR" ]; then
    fatal "Target exists but is not a directory: $TARGET_DIR. Move or remove it and rerun."
  fi

  if [ -d "$TARGET_DIR" ]; then
    if [ -d "$TARGET_DIR/.git" ]; then
      update_existing_repository
      return
    fi

    fatal "Target directory exists but is not a git repository: $TARGET_DIR. Move or remove it and rerun."
  fi

  clone_repository
}

start_appliance_manager() {
  local installer="$TARGET_DIR/scripts/install.sh"
  local -a installer_args=()

  [ -f "$installer" ] || fatal "Appliance Manager not found after checkout: $installer"

  log_step "Starting Narrowcasting Appliance Manager"
  chmod +x "$installer"

  cd "$TARGET_DIR"

  if [ "$PASS_YES" -eq 1 ]; then
    installer_args+=(--yes)
  fi

  if [ -r /dev/tty ]; then
    exec "$installer" "${installer_args[@]}" < /dev/tty
  fi

  log_warning "/dev/tty is not available; continuing with current stdin."
  exec "$installer" "${installer_args[@]}"
}

main() {
  parse_args "$@"
  expand_target_dir

  log_step "Narrowcasting bootstrap"
  ensure_minimal_prerequisites
  prepare_repository
  start_appliance_manager
}

main "$@"
