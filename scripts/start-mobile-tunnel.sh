#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MOBILE_DIR="$ROOT_DIR/mobile"

cd "$MOBILE_DIR"

if ! command -v npm >/dev/null 2>&1; then
  echo "Nenalezen npm/Node. Nainstaluj Node pres: brew install node" >&2
  exit 1
fi

if [[ ! -d "node_modules" ]]; then
  npm install
fi

npx expo start --tunnel "$@"
