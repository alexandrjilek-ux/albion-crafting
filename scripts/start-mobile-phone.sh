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

LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || true)"
if [[ -z "$LAN_IP" ]]; then
  LAN_IP="$(ifconfig | awk '/inet / && $2 != "127.0.0.1" { print $2; exit }')"
fi

if [[ -z "$LAN_IP" ]]; then
  echo "Nepodarilo se zjistit LAN IP Macu. Zkus: ifconfig | grep 'inet '" >&2
  exit 1
fi

if ! curl -fsS --max-time 5 "http://$LAN_IP:8000/healthz" >/dev/null; then
  echo "Backend neodpovida na http://$LAN_IP:8000/healthz" >&2
  echo "Nejdriv spust: Start Backend.command" >&2
  echo "Pokud backend bezi, zkontroluj macOS firewall." >&2
  exit 1
fi

echo "Expo Go bude volat backend na: http://$LAN_IP:8000"
EXPO_PUBLIC_API_URL="http://$LAN_IP:8000" npx expo start --lan --port 8081 "$@"
