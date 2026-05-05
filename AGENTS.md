# AGENTS.md

Konvenční instrukce pro AI coding agenty (Codex, Claude Code, Cursor, Aider …).
Tenhle soubor je entry point — přečti ho **vždy první** než cokoli změníš.
Detailní per-modul docs jsou v `backend/README.md` a `mobile/README.md`.

---

## 1. Co je tohle za projekt

**Albion Crafting Analyzer** — tool pro hru Albion Online, který radí, co se
vyplatí craftit (equipment, food), refinovat, levelit a transportovat mezi
royal cities. Wraps AODP API (price data) a Gameinfo API (recipes).

**Aktuální fáze (Phase 1):** hybrid rewrite z původní Streamlit Python aplikace
do **FastAPI backend + Expo/React Native mobile frontend** pro iOS App Store.
Cílová platforma je iPhone (primary) + iPad (three-pane layout).

Zhruba: backend exposuje stejný analytický engine z původního Streamlitu jako
JSON REST endpointy, mobile FE volá REST a renderuje native iOS UI s designem
*Frost & Arcane* (viz `mockups/variant2_color_frost_arcane.html`).

---

## 2. Repo layout — co kam patří

```
.
├── backend/              # FastAPI backend (Phase 1 — aktivní vývoj)
│   ├── app/
│   │   ├── main.py       # FastAPI factory + CORS + router wiring
│   │   ├── core/         # Pure-Python engine (původní albion_crafting.py atd.)
│   │   ├── routes/       # APIRouter modules per resource (items, refining, …)
│   │   ├── schemas/      # Pydantic v2 request/response models
│   │   └── services/     # Tenké wrappery volající core funkce
│   ├── tests/            # pytest smoke tests
│   ├── requirements.txt
│   └── README.md         # ← detail backend setupu, endpointy, gotchas
│
├── mobile/               # Expo React Native frontend (Phase 1 — aktivní vývoj)
│   ├── app/              # expo-router (file-based routing)
│   │   ├── _layout.tsx
│   │   ├── (tabs)/       # main tab nav: index (Forge), refining, leveling, transport
│   │   └── item/[id].tsx # detail screen
│   ├── src/
│   │   ├── api/          # HTTP client + per-endpoint moduly + types.ts
│   │   ├── components/   # GlowCard, ChampionPodium, ItemRow, FilterChips, …
│   │   ├── hooks/        # useTopItems
│   │   ├── theme/        # colors, spacing, typography (Frost & Arcane)
│   │   └── utils/        # format.ts (silver, %, freshness, route)
│   ├── babel.config.js   # ⚠ reanimated/plugin MUSÍ být poslední
│   ├── tsconfig.json     # path aliases (@theme/*, @api/*, …)
│   └── README.md         # ← detail mobile setupu, EAS Build, gotchas
│
├── mockups/              # HTML/CSS designové podklady (Frost & Arcane direction)
├── files/                # ⚠ LEGACY — původní Streamlit app, nesahej, neopravuj
├── záloha/               # ⚠ LEGACY záloha — nesahej
├── backup_streamlit_*/   # ⚠ LEGACY záloha — nesahej
├── IMPLEMENTATION_PLAN.md   # design + research dokument (proč hybrid stack)
├── README.md             # human-facing landing page
└── AGENTS.md             # tenhle soubor
```

**Kritické pravidlo: nesahej do `files/`, `záloha/`, `backup_streamlit_*/`.**
Tohle je původní Streamlit verze, archiv. Vývoj jde přes `backend/` + `mobile/`.

---

## 3. Lokální setup — quickstart

### Backend (Python 3.12+)

```bash
cd backend
python -m venv .venv && source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Smoke test: `curl http://localhost:8000/healthz` → `{"ok": true, "version": "..."}`.
Swagger UI: `http://localhost:8000/docs`.

### Mobile (Node 20+, Expo SDK 51)

```bash
cd mobile
npm install
cp .env.example .env.local       # nastav EXPO_PUBLIC_API_URL na svou LAN-IP
npx expo start --tunnel          # nejspolehlivější přes Windows
```

Sken QR z **Expo Go** appky (iOS / Android). Detaily v `mobile/README.md`.

---

## 3.5. Sekrety + env soubory

Per-modul `.env.example` jsou v gitu jako šablony. Reálné hodnoty jdou do
`.env` (backend) nebo `.env.local` (mobile) — oboje je v `.gitignore`.

| Soubor | Účel | V gitu? |
|---|---|---|
| `backend/.env.example` | šablona — `ALBION_CORS_ORIGINS`, region | ✅ ano |
| `backend/.env` | reálné hodnoty pro lokální backend | ❌ ne |
| `mobile/.env.example` | šablona — `EXPO_PUBLIC_API_URL` | ✅ ano |
| `mobile/.env.local` | reálná LAN-IP backendu pro Expo Go | ❌ ne |
| `files/.env` | legacy Streamlit env — **nesahej** | ❌ ne |

**Pravidla:**
- **Nikdy necommituj** `.env`, `.env.local`, `.env.*.local`. `.gitignore` je
  blokuje, ale verify před `git add` (`git status` ignoruje gitignore — `git
  check-ignore <file>` ti řekne pravdu).
- **Žádné secrety v `EXPO_PUBLIC_*`** — všechny `EXPO_PUBLIC_*` proměnné se
  bundlují do client appky a jsou viditelné v binárce. Backend URL je OK,
  API klíče NE.
- **GitHub PAT a podobné** patří do `secrets/` v CI / GitHub Actions, ne
  do repo souborů.

---

## 4. Verifikace — než tvrdíš, že je hotovo

Vždy spusť obojí (podle toho, co se měnilo):

```bash
# Backend
cd backend && pytest -v
cd backend && python -c "from app.main import app; print(len(app.routes))"  # smoke parse

# Mobile (TypeScript check)
cd mobile && npx tsc --noEmit

# Mobile lint (pokud existuje eslint config)
cd mobile && npx eslint src/ app/
```

Po reálném testu na zařízení: backend musí běžet, telefon musí mít
`EXPO_PUBLIC_API_URL` na LAN-IP počítače (ne `localhost`!). Reload Expo Go
přes shake → "Reload", nebo `r` v Expo terminálu.

---

## 4.5. Definition of Done

Task lze označit jako hotový **jen když platí všechny relevantní body**:

### Backend změny
- [ ] `pytest -v` prochází (žádné nové fail-y).
- [ ] `python -c "from app.main import app; print(len(app.routes))"` neselže
      (route registration smoke test).
- [ ] Nové endpointy mají Pydantic schemas s `description=` u každého `Field`.
- [ ] CORS / 4xx / 5xx error handling promyšlený (ValueError → 400, upstream → 502).
- [ ] Manuální cURL test proti `http://localhost:8000` → očekávaná payload shape.
- [ ] Pokud route mění shape responsu, **frontend types.ts aktualizován**.

### Mobile změny
- [ ] `npx tsc --noEmit` (z `mobile/`) prochází bez errorů.
- [ ] Žádné nové `any` bez `// eslint-disable-line` komentáře s důvodem.
- [ ] Změny v komponentech používají theme tokens (`colors`, `spacing`, …),
      ne hardcoded hodnoty.
- [ ] Nové dependencies **odůvodněné v commit message** (proč ne primitives).
- [ ] Manuální test v **Expo Go na real device** — screen mountí, akce fungují,
      žádné JS errory v Metro consoli.
- [ ] Pokud měníš `(tabs)` strukturu, ověř iPhone i iPad layout
      (rotace iPadu na šířku spustí `width >= 768` → three-pane).

### Cross-cutting
- [ ] Komentáře u netriviálního kódu **česky, vysvětlují PROČ**.
- [ ] Žádné secrety v commitu (`git diff --cached` review před `git commit`).
- [ ] Žádné velké binárky / lockfile diffy bez důvodu.
- [ ] Conventional commit message (`feat(scope): …`, `fix(scope): …`).
- [ ] Pokud jde o user-facing změnu, krátce ji popsat při shrnutí (Codex / Claude
      "Hotovo. Co se změnilo: …" — usnadní release notes).

---

## 5. Workflow per task type — kam přidat co

### Nový backend endpoint

1. **Schema** — `backend/app/schemas/<resource>.py` (Pydantic v2 BaseModel,
   `Request` + `Response` třídy s `Field(default=…, description=…)`).
2. **Service** — `backend/app/services/<resource>_service.py` (volá funkce
   z `app/core/`, žádná FastAPI dependence — testovatelné izolovaně).
3. **Route** — `backend/app/routes/<resource>.py` s `router = APIRouter(prefix=…)`.
4. **Wire-up** — přidej `<resource>` do `from app.routes import …` a
   `app.include_router(<resource>.router)` v `app/main.py`.
5. **TypeScript zrcadlo** — `mobile/src/api/types.ts` (Request/Response interface).
6. **API klient** — `mobile/src/api/<resource>.ts` (`fetch<Resource>()` přes `client.ts`).

### Nový mobile screen

- **Tab screen** → `mobile/app/(tabs)/<name>.tsx` + přidat tab v
  `mobile/app/(tabs)/_layout.tsx` (custom `GlassTabBar`).
- **Detail/modal screen** → `mobile/app/<resource>/[id].tsx` (dynamic route).
- Layout se přepíná na iPad (three-pane) přes
  `useWindowDimensions().width >= breakpoints.tablet` (768).

### Nový reusable komponent

`mobile/src/components/<Name>.tsx` + export v `mobile/src/components/index.ts`.
Komponent musí:
- Použít `colors`, `spacing`, `typography`, `radius`, `glow` z `src/theme/*` —
  **nikdy hardcoded barvy / paddingy**.
- Mít `Props` interface vyexportovaný z indexu.
- Pro multi-state UI použít discriminated unions (`variant: 'arcane' | 'frost'`).

### Nový theme token

`mobile/src/theme/colors.ts` (nebo `spacing.ts` / `typography.ts`). Komentář
nahoře v `colors.ts` mapuje CSS variables z mockupu na TS jména — **drž 1:1
mapping** s mockup HTML, ať jde tokeny snadno aktualizovat.

---

## 6. Konvence kódu

### Jazyk komentářů

- **Komentáře píšeme česky** (občas s anglickými technickými termíny).
- Komentáře vysvětlují **proč**, ne **co** — kód sám ukáže co.
- U netriviálních rozhodnutí piš krátký důvod (např. *"min_volume=1, ne 5,
  protože AODP v období low-activity vrací prázdno"*).

### Backend (Python)

- Python **3.12+** (engine v `core/albion_crafting.py` používá PEP 701
  nested f-strings — 3.10/3.11 fail to parse).
- Pydantic **v2** syntax (`Field(default=…)`, `model_config`).
- `from __future__ import annotations` v každém modulu.
- Type hints všude, `mypy --strict` friendly.
- HTTP errors přes `HTTPException(status_code=…, detail=…)`. ValueError z
  enginu mapuj na 400, neočekávané excepce na 502 (upstream AODP error).
- **Nikdy nelogu API klíče ani PAT** (ten je v `files/.env`, nikdy do gitu).

### Mobile (TypeScript / React Native)

- **Strict TypeScript** — žádné `any` bez komentáře proč.
- Funkční komponenty + hooks. Žádné class komponenty.
- State přes `useState` / `useMemo` / `useCallback`. Pro server cache
  `useTopItems`-style hook (ne Redux, ne Zustand — zatím nepotřeba).
- `req` v `useMemo` musí mít všechny dep filtry — drift = stale fetch.
- Path aliases (`@theme/*`, `@api/*`, …) — **alias keys v `babel.config.js`
  musí být shodné s `paths` v `tsconfig.json`**. Drift = nejčastější bug.
- **Nepřidávej native moduly** bez prebuild (Expo managed workflow). Pokud
  něco vyžaduje native code, vyhodnoť alternativy (např. PriceHistoryChart
  jsem postavil z `<View>` místo `react-native-svg`).
- iOS-first design, ale layout musí fungovat na Androidu (`Platform.select`
  pro fontFamily v `theme/typography.ts`).

### Commits

Conventional Commits style:

```
feat(forge): add custom focus budget input
fix(items): cap min_volume at 200 to match backend schema
chore(deps): bump expo to 51.0.40
```

---

## 7. Známé gotchas (přečti **před** debug session)

### OneDrive sync lag
Repo žije v OneDrive složce. Po `Edit` přes API může být soubor v bash mountu
**ještě 10-30 s nezesynchronizován** (a vidět starou/uříznutou verzi). Pokud
`tsc --noEmit` ukazuje absurdní errory hned po editu, počkej `sleep 15` a
zkus znovu.

### Reanimated plugin order
`react-native-reanimated/plugin` **musí být poslední** v `babel.config.js`.
Když přidáš jiný babel plugin, vlož ho **před** něj. Po změně vždy
`npx expo start --clear` (Metro cache).

### Network request failed na real device
Backend běží na `localhost:8000` v PC. Telefon vidí jiný `localhost`.
Nastav `EXPO_PUBLIC_API_URL=http://<LAN-IP>:8000` v `.env.local` a `--lan`,
nebo použij `--tunnel`.

### Path aliases přestaly fungovat
1. Verify alias keys v `babel.config.js` == `paths` v `tsconfig.json`.
2. `npx expo start --clear` (Metro cache invalidate).

### AODP / Gameinfo rate limits
AODP nemá oficiální rate limit, ale prosíme o slušnost (max ~10 req/s, batch
přes `,`-separated IDs). Gameinfo občas vrací 503 — backend retry-uje 2×
s exponential backoff.

### Caerleon
Caerleon je black zone city — vstup vyžaduje PvP risk. Některé endpointy
mají flag `no_caerleon: bool` pro filtrování. UI to exponuje jako toggle,
default `false` (Caerleon zahrnut).

---

## 8. Co NEDĚLAT

- ❌ **Neměň `files/`, `záloha/`, `backup_streamlit_*/`.** Legacy, archiv.
- ❌ **Nedělej `npm install <native-module>` bez ejection plánu.** Expo
  managed workflow padá na první native dep, která chce `pod install`.
- ❌ **Nehard-coduj barvy / paddingy v komponentech.** Vše přes theme tokens.
- ❌ **Nepřidávej `localStorage` / `sessionStorage`.** RN je nemá; pro
  perzistenci použij `AsyncStorage` (až bude potřeba; zatím není).
- ❌ **Nepřidávej dependencies bez explicit důvodu.** Každá knihovna = +size
  + maintenance + supply chain risk. Často jde věc postavit z primitives.
- ❌ **Nelogu sekrety.** Žádné AODP / Apple / EAS klíče v console / commitech.
- ❌ **Nesahej do souborů uvedených v `.codexignore`** bez explicit dotazu —
  jsou to lockfiles, cache JSONy, mockupy, legacy folders. Codex / Cursor /
  Aider je default skipnou.

---

## 9. Když si nejsi jistý

1. Mrkni do `IMPLEMENTATION_PLAN.md` (root) — důvody architektonických rozhodnutí.
2. Mrkni do `mockups/variant2_color_frost_arcane.html` — vizuální source of
   truth pro design.
3. Mrkni do `backend/README.md` nebo `mobile/README.md` — detailní per-modul
   instrukce, troubleshooting, EAS Build setup.
4. Dotaz user — radši se zeptat než hádat (zvlášť u game-mechanics rozhodnutí
   typu "co je sensible default pro `focus_budget`").
