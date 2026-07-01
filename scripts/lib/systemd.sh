#!/usr/bin/env bash

service_template_path() {
  printf '%s/deployment/systemd/%s.service\n' "$ROOT_DIR" "$1"
}

render_service_template() {
  local service_name="$1"
  local output_path="$2"
  local template_path
  local service_uid
  template_path="$(service_template_path "$service_name")"
  [ -f "$template_path" ] || fatal "Systemd template not found: $template_path"
  service_uid="$(id -u "$SERVICE_USER" 2>/dev/null || echo 1000)"

  sed \
    -e "s#User=pi#User=$SERVICE_USER#g" \
    -e "s#WorkingDirectory=/opt/narrowcasting#WorkingDirectory=$ROOT_DIR#g" \
    -e "s#Environment=NARROWCASTING_ROOT=/opt/narrowcasting#Environment=NARROWCASTING_ROOT=$ROOT_DIR#g" \
    -e "s#/opt/narrowcasting/scripts/#$ROOT_DIR/scripts/#g" \
    -e "s#/home/pi/.Xauthority#/home/$SERVICE_USER/.Xauthority#g" \
    -e "s#XDG_RUNTIME_DIR=/run/user/1000#XDG_RUNTIME_DIR=/run/user/$service_uid#g" \
    "$template_path" > "$output_path"
}

install_systemd_service() {
  local service_name="$1"
  local rendered
  rendered="$(mktemp)"
  render_service_template "$service_name" "$rendered"
  sudo_cmd install -m 0644 "$rendered" "/etc/systemd/system/$service_name.service"
  rm -f "$rendered"
  log_success "Installed $service_name.service"
}

reload_systemd() {
  sudo_cmd systemctl daemon-reload
}

enable_service() {
  local service_name="$1"
  sudo_cmd systemctl enable "$service_name.service"
}

start_or_restart_service() {
  local service_name="$1"
  if systemctl is-active --quiet "$service_name.service" 2>/dev/null; then
    sudo_cmd systemctl restart "$service_name.service"
  else
    sudo_cmd systemctl start "$service_name.service"
  fi
}

verify_service() {
  local service_name="$1"
  if systemctl is-enabled --quiet "$service_name.service" 2>/dev/null; then
    log_success "$service_name.service is enabled"
  else
    log_warning "$service_name.service is not enabled"
  fi

  if systemctl is-active --quiet "$service_name.service" 2>/dev/null; then
    log_success "$service_name.service is active"
  else
    log_warning "$service_name.service is not active"
  fi
}

install_env_file_if_absent() {
  local filename="$1"
  local content="$2"
  sudo_cmd mkdir -p "$CONFIG_DIR"
  write_file_if_absent "$CONFIG_DIR/$filename" "$content" "0600" "root"
}
