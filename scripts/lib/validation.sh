#!/usr/bin/env bash

require_linux() {
  [ "$(uname -s)" = "Linux" ] || fatal "Unsupported OS. These production scripts target Raspberry Pi/Linux."

  if [ -r /etc/os-release ]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    log_info "Detected ${PRETTY_NAME:-Linux}"
  else
    log_warning "Unable to read /etc/os-release; continuing because kernel is Linux."
  fi
}

warn_if_not_raspberry_pi() {
  if [ -r /proc/device-tree/model ] && grep -qi "raspberry pi" /proc/device-tree/model; then
    log_info "Detected Raspberry Pi hardware."
    return
  fi

  log_warning "Raspberry Pi hardware was not detected. Continuing because generic Linux is supported."
}

require_repo_root() {
  [ -d "$ROOT_DIR/server" ] || fatal "server/ not found. Run this script from the Narrowcasting repository."
  [ -d "$ROOT_DIR/dashboard" ] || fatal "dashboard/ not found. Run this script from the Narrowcasting repository."
  [ -d "$ROOT_DIR/player" ] || fatal "player/ not found. Run this script from the Narrowcasting repository."
  [ -d "$ROOT_DIR/agent" ] || fatal "agent/ not found. Run this script from the Narrowcasting repository."
  [ -d "$ROOT_DIR/deployment/systemd" ] || fatal "deployment/systemd/ not found."
  [ -d "$ROOT_DIR/scripts" ] || fatal "scripts/ not found."
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fatal "$1 is required. Install it and re-run this script."
}

require_node_runtime() {
  require_command node
  require_command npm

  local major
  major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  if [ "$major" -lt 20 ]; then
    fatal "Node.js 20 or newer is required. Current version: $(node --version 2>/dev/null || echo unknown)."
  fi
}

require_systemd() {
  require_command systemctl
  [ -d /etc/systemd/system ] || fatal "/etc/systemd/system not found. systemd service installation is unavailable."
}

require_git_repo() {
  [ -d "$ROOT_DIR/.git" ] || fatal "This update requires a git checkout at $ROOT_DIR."
  require_command git
}

require_clean_update_state() {
  if [ "${ALLOW_DIRTY_UPDATE:-0}" -eq 1 ]; then
    log_warning "ALLOW_DIRTY_UPDATE=1 set; continuing with a dirty worktree if present."
    return
  fi

  if [ -n "$(git -C "$ROOT_DIR" status --porcelain)" ]; then
    fatal "Working tree has local changes. Commit/stash them or set ALLOW_DIRTY_UPDATE=1."
  fi
}
