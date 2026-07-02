#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${NARROWCASTING_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

build_part() {
  local part="$1"
  echo "Building $part..."
  cd "$ROOT_DIR/$part"
  npm run build
}

build_part server
build_part dashboard
build_part player
build_part agent

echo "Production build complete."
