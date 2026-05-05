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

if ! curl -fsS --max-time 5 http://localhost:8000/healthz >/dev/null; then
  echo "Backend neodpovida na http://localhost:8000/healthz" >&2
  echo "Nejdriv spust: Start Backend.command" >&2
  exit 1
fi

echo "iOS Simulator bude volat backend na: http://localhost:8000"
EXPO_PUBLIC_API_URL=http://localhost:8000 npx expo start --ios --port 8081 "$@"
