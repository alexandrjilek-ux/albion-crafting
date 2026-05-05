"""
Pytest bootstrap — ensures `app` is importable when running from backend/.

Lets `pytest -v` work without a setup.py / pyproject.toml. When the
project graduates to a packaged install (`pip install -e .`), this can
be removed.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
