
#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"

cd "$BACKEND_DIR"

if [[ ! -x ".venv/bin/python" ]]; then
  echo "Backend .venv neexistuje. Vytvarim ho pres Python 3.12..."
  if command -v python3.12 >/dev/null 2>&1; then
    python3.12 -m venv .venv
  elif [[ -x "/opt/homebrew/bin/python3.12" ]]; then
    /opt/homebrew/bin/python3.12 -m venv .venv
  else
    echo "Nenalezen Python 3.12. Nainstaluj ho pres: brew install python@3.12" >&2
    exit 1
  fi
fi

source .venv/bin/activate

python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
