#!/usr/bin/env bash

install_system_packages() {
  if [ "$SKIP_SYSTEM_PACKAGES" -eq 1 ]; then
    log_info "Skipping system package installation."
    return
  fi

  if ! command -v apt-get >/dev/null 2>&1; then
    log_warning "apt-get not found. Skipping system package installation."
    return
  fi

  if ! confirm "Install/update common Linux packages with apt-get?"; then
    log_info "System package installation skipped by operator."
    return
  fi

  sudo_cmd apt-get update
  sudo_cmd apt-get install -y ca-certificates curl git openssl
}

install_player_system_packages() {
  install_system_packages

  if command -v chromium >/dev/null 2>&1 || command -v chromium-browser >/dev/null 2>&1 || command -v google-chrome >/dev/null 2>&1; then
    log_info "Chromium-compatible browser already installed."
    return
  fi

  if command -v apt-get >/dev/null 2>&1 && confirm "Install Chromium for kiosk playback?"; then
    sudo_cmd apt-get install -y chromium-browser || sudo_cmd apt-get install -y chromium
  else
    log_warning "Chromium was not installed. Kiosk service may not start until Chromium is installed."
  fi
}

npm_install_part() {
  local part="$1"
  log_step "Installing npm dependencies for $part"
  if [ -f "$ROOT_DIR/$part/package-lock.json" ]; then
    run_cmd npm --prefix "$ROOT_DIR/$part" ci
  else
    run_cmd npm --prefix "$ROOT_DIR/$part" install
  fi
}

build_part() {
  local part="$1"
  log_step "Building $part"
  run_cmd npm --prefix "$ROOT_DIR/$part" run build
}

npm_install_all() {
  npm_install_part server
  npm_install_part dashboard
  npm_install_part player
  npm_install_part agent
}

build_all() {
  build_part server
  build_part dashboard
  build_part player
  build_part agent
}
