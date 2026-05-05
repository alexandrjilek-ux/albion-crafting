# Albion Crafting API — Backend

FastAPI service exposing the Albion crafting analytical engine as JSON
endpoints. Wraps the same `albion_crafting.py` / `recipes.py` /
`refining_report.py` / `leveling_cost.py` / `transport.py` modules that
the original Streamlit app uses — no code duplication of business logic.

This is **Phase 1** of the iOS app project (see `../IMPLEMENTATION_PLAN.md`).
The Streamlit app under `../files/` is unchanged and keeps running.

## Stack

- **Python 3.12+ required** (the engine in `app/core/albion_crafting.py` uses
  PEP 701 nested f-strings — Python 3.10/3.11 will fail to parse it)
- FastAPI + Uvicorn
- Pydantic v2
- `requests` for AODP / GameInfo HTTP calls

## Setup

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS / Linux:
source .venv/bin/activate

pip install -r requirements.txt
cp .env.example .env   # optional — defaults are dev-friendly
```

## Run

```bash
uvicorn app.main:app --reload --port 8000
```

Then open:

- **Swagger UI** — http://localhost:8000/docs (interactive API explorer)
- **ReDoc** — http://localhost:8000/redoc
- **OpenAPI JSON** — http://localhost:8000/openapi.json

## Endpoints

| Method | Path                | Purpose                                                              |
|--------|---------------------|----------------------------------------------------------------------|
| GET    | `/healthz`          | Liveness probe (returns version)                                     |
| GET    | `/cities`           | Static city bonus reference (equipment + food + refining)            |
| POST   | `/items/top`        | Top profitable craftable items (equipment OR food, all parameters)   |
| POST   | `/refining`         | Refining (ore→bar / wood→planks / hide→leather / fiber→cloth) profit |
| POST   | `/leveling-cost`    | T2→T4 Expert leveling silver-per-fame analysis                       |
| GET    | `/transport`        | Fast-travel fee for batch transport between royal cities             |

### Quick examples

```bash
# Health
curl http://localhost:8000/healthz

# City reference
curl http://localhost:8000/cities

# Top equipment items in Martlock, T4, with focus
curl -X POST http://localhost:8000/items/top \
  -H "Content-Type: application/json" \
  -d '{"city":"Martlock","tiers":[4],"top":10}'

# Top food items, auto city
curl -X POST http://localhost:8000/items/top \
  -H "Content-Type: application/json" \
  -d '{"city":"auto","tiers":[5,6],"mode":"food","top":15}'

# Refining T4–T6
curl -X POST http://localhost:8000/refining \
  -H "Content-Type: application/json" \
  -d '{"tiers":[4,5,6]}'

# Leveling cost in Bridgewatch with journal
curl -X POST http://localhost:8000/leveling-cost \
  -H "Content-Type: application/json" \
  -d '{"city":"Bridgewatch","use_journal":true}'

# Sell recommendation — where to sell inventory after tax + transport
curl -X POST http://localhost:8000/sell \
  -H "Content-Type: application/json" \
  -d '{"from_city":"Bridgewatch","items":[{"unique_name":"T4_BAG","quantity":10,"category":"BAG","tier":4}]}'
```

## Tests

```bash
# from backend/
pytest -v
```

The smoke test `tests/test_health.py` verifies `/healthz` returns 200
and the expected payload shape. Add more tests as endpoints stabilize.

## Layout

```
backend/
├── app/
│   ├── main.py             # FastAPI app factory + CORS + router wiring
│   ├── core/               # Pure-Python engine (copied from ../files/, no Streamlit)
│   │   ├── albion_crafting.py
│   │   ├── recipes.py
│   │   ├── refining_report.py
│   │   ├── leveling_cost.py
│   │   ├── transport.py
│   │   └── data/           # Bundled cache JSONs (recipes, item names)
│   ├── routes/             # FastAPI APIRouter modules per resource
│   ├── schemas/            # Pydantic request/response models
│   └── services/           # Thin wrappers calling core functions
├── tests/
├── requirements.txt
├── .env.example
└── README.md
```

## Notes

- **Cache files** (`recipes_cache.json`, `item_names_cache.json`) are
  bundled in `app/core/data/`. The `RecipeLoader` and `ItemNameLoader`
  resolve them via module-relative path so cwd doesn't matter.
- **AODP region** is hardcoded to Europe inside `core/albion_crafting.py`
  (`AODP_BASE` constant). To support Americas / Asia, the constant has to
  be parameterised — out of scope for Phase 1.
- **No HTML report endpoints.** The Streamlit app rendered HTML reports
  via `write_html_report`. Those functions still exist in `app/core/` but
  are not routed — the mobile frontend will render JSON natively.
- **No persistent cache for AODP responses** yet. Phase 1 calls AODP
  on every request. Add an in-memory TTL cache (e.g. `cachetools`) once
  load matters — see `IMPLEMENTATION_PLAN.md` Phase 1.
