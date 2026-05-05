# Albion Crafting Analyzer

Tool pro hru **Albion Online**, který radí, co se vyplatí craftit, refinovat,
levelit a transportovat mezi royal cities. Postavený nad
[AODP API](https://www.albion-online-data.com/) (price data) a
[Gameinfo API](https://gameinfo.albiononline.com) (recipes).

**Status:** rewrite z původního Streamlit prototypu na hybrid stack
(FastAPI backend + Expo React Native mobile FE) pro iOS App Store.
Cílová platforma: iPhone + iPad three-pane. Design *Frost & Arcane*
(viz `mockups/variant2_color_frost_arcane.html`).

---

## Repo struktura

| Složka | Co je uvnitř | Status |
|---|---|---|
| `backend/` | FastAPI + Python engine (analytical core) | aktivní vývoj — Phase 1 |
| `mobile/` | Expo / React Native frontend, expo-router | aktivní vývoj — Phase 1 |
| `mockups/` | HTML/CSS designové podklady | reference |
| `files/` | Původní Streamlit aplikace | **legacy — nesahat** |
| `záloha/`, `backup_streamlit_*/` | Archivní zálohy | **legacy — nesahat** |
| `IMPLEMENTATION_PLAN.md` | Designový dokument (proč hybrid stack) | reference |
| `AGENTS.md` | Instrukce pro AI coding agenty (Codex, Claude Code, …) | ⭐ start here |

---

## Quick start

### 1. Backend (FastAPI, Python 3.12+)

```bash
cd backend
python -m venv .venv && source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Smoke test: `curl http://localhost:8000/healthz`. Swagger: <http://localhost:8000/docs>.
Detaily: [`backend/README.md`](backend/README.md).

### 2. Mobile (Expo SDK 51, Node 20+)

```bash
cd mobile
npm install
cp .env.example .env.local       # nastav EXPO_PUBLIC_API_URL na svou LAN-IP
npx expo start --tunnel
```

Sken QR kódu z **Expo Go** appky na telefonu. Detaily, EAS Build, App Store submit:
[`mobile/README.md`](mobile/README.md).

---

## Featury (current)

**Mobile aplikace (Expo Go):**
- 🏆 **Forge tab** — top profitable items (champion podium + leaderboard) s filtry:
  city, mode (equipment/food), tier, enchant, focus budget, min daily volume,
  no-Caerleon toggle.
- 📊 **Detail itemu** — recept, ceny surovin per město, graf historie ceny.
- ⚙️ **Refining** — ore→bar / wood→planks / hide→leather / fiber→cloth profit.
- 📈 **Leveling** — silver-per-fame analýza T2→T4 Expert spec.
- 🚛 **Transport** — fast-travel fee mezi royal cities.

**Backend endpointy:**
- `POST /items/top` — equipment/food top items
- `GET /items/{unique_name}` — item detail (recipe + prices + history)
- `POST /refining`, `POST /leveling-cost`, `GET /transport`, `GET /cities`
- `GET /healthz`

---

## Pro AI agenty / Codex / Claude Code

Přečti **`AGENTS.md`** — repo konvence, kam přidávat věci, gotchas, co nedělat.

Detail per-modul docs: [`backend/README.md`](backend/README.md),
[`mobile/README.md`](mobile/README.md).

---

## Licence + autorství

Solo projekt, bez licence (zatím nepublikovaný). Albion Online je trademark
**Sandbox Interactive GmbH** — tato aplikace s nimi není affiliovaná, používá
public AODP / Gameinfo APIs.
