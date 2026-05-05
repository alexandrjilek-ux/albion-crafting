# Albion Crafting — mobile (Expo + React Native)

Mobilní frontend pro Albion crafting tool. Hovoří s FastAPI backendem
v `../backend/`. Stack: **Expo SDK 51 + React Native 0.74 + TypeScript +
expo-router (file-based)**. Design: Frost & Arcane (V2C), viz
`../mockups/variant2_color_frost_arcane.html`.

## Struktura

```
mobile/
├─ app/                       # expo-router (file-based routing)
│  ├─ _layout.tsx             # root Stack, theme provider, status bar
│  ├─ (tabs)/
│  │  ├─ _layout.tsx          # custom GlassTabBar
│  │  ├─ index.tsx            # Top items (champion podium + leaderboard)
│  │  ├─ refining.tsx         # Refining calculator
│  │  ├─ leveling.tsx         # Calendar / manual Activities bonuses
│  │  └─ sell.tsx             # Sell recommendations
│  └─ item/[id].tsx           # Modal — item detail (placeholder, čeká na endpoint)
├─ src/
│  ├─ theme/                  # colors, spacing, typography (Frost & Arcane)
│  ├─ components/             # GlowCard, ChampionPodium, ItemRow, GlassTabBar, …
│  ├─ api/                    # client.ts + per-endpoint moduly + types.ts
│  ├─ hooks/                  # useTopItems
│  └─ utils/                  # format.ts (silver, %, freshness, route)
├─ assets/                    # placeholder PNG (nahraď před submitem)
├─ app.json                   # Expo config (bundle id, splash, plugins)
├─ eas.json                   # EAS Build profily (development / preview / production)
├─ babel.config.js            # POZOR: reanimated/plugin musí být POSLEDNÍ
├─ metro.config.js
├─ tsconfig.json              # path aliases (@theme/*, @api/*, …)
├─ .env.example               # EXPO_PUBLIC_API_URL
└─ package.json
```

## Lokální setup

### 1) Nainstaluj závislosti

```bash
cd mobile
npm install
```

> Sandbox při scaffoldingu nedělal `npm install` (žádná síť), takže `node_modules/`
> tu zatím není. Tohle je první krok lokálně.

### 2) Nastav backend URL

```bash
cp .env.example .env.local
# Edituj .env.local podle toho, jak budeš spouštět:
#   - iOS simulator:        http://localhost:8000
#   - Android emulator:     http://10.0.2.2:8000
#   - iPhone přes Expo Go:  http://<LAN-IP>:8000   (např. 192.168.1.42)
#   - Production:           https://api.tvuj-domain.tld
```

### 3) Spusť backend

```bash
cd ../backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Zkontroluj, že `http://localhost:8000/healthz` odpovídá. Swagger:
`http://localhost:8000/docs`.

### 4) Spusť Expo dev server

```bash
cd ../mobile
npx expo start --tunnel    # nejspolehlivější přes veřejný tunel (Windows-friendly)
# nebo
npx expo start --lan       # rychlejší, ale telefon musí být na stejné Wi-Fi
```

Sken QR kódu z **Expo Go** appky (iOS / Android). Na Macu lze `i` pro iOS
simulátor, `a` pro Android emulator.

> **Windows users:** iOS simulator nemáš. Cesty: (a) Expo Go přes USB nebo
> Wi-Fi tunnel, (b) Android Studio emulator pro Android, (c) **EAS Build →
> TestFlight** pro reálný iOS test bez Macu.

## EAS Build (z Windows)

Pro reálné iOS / Android buildy (a App Store submit):

```bash
npm install -g eas-cli
eas login
# v `eas.json` nahraď `REPLACE_WITH_*` placeholdery (ascAppId, appleTeamId, …)
eas build:configure
eas build --profile development --platform ios     # development client
eas build --profile preview --platform ios         # ad-hoc / TestFlight internal
eas build --profile production --platform ios      # App Store submit
```

> První build bere ~15–25 min na EAS cloud queue. iOS production build
> potřebuje **Apple Developer account ($99/rok)** a Apple ID/Team ID
> v `eas.json` `submit.production.ios`.

## API endpointy (FastAPI)

| Endpoint           | Metoda | Modul v `src/api/`                  |
|--------------------|--------|-------------------------------------|
| `/healthz`         | GET    | (přímo z `client.ts` ad-hoc)        |
| `/cities`          | GET    | `cities.ts → fetchCities()`         |
| `/items/top`       | POST   | `items.ts → fetchTopItems()`        |
| `/refining`        | POST   | `refining.ts → fetchRefining()`     |
| `/leveling-cost`   | POST   | `leveling.ts → fetchLevelingCost()` |
| `/transport`       | GET    | `transport.ts → fetchTransportFee()`|

Typy zrcadlí Pydantic schémata z `backend/app/schemas/`. Výsledné `rows`
(items / refining / leveling) jsou typované jako `Record<string, unknown>` —
backend záměrně vrací `Dict[str, Any]`, FE projektuje subset polí.

## Časté problémy

### `Unable to resolve "react-native-reanimated/plugin"`
Reanimated plugin **musí být poslední** v `babel.config.js`. Pokud přidáš
další plugin, doplň ho **před** `'react-native-reanimated/plugin'`. Po změně:
`npx expo start --clear` (resetuje Metro cache).

### `Network request failed` na real device
Backend běží na `localhost:8000` v PC. Telefon vidí jiný `localhost`. Buď:
1. `EXPO_PUBLIC_API_URL=http://<LAN-IP>:8000` v `.env.local` a `--lan`
2. Nebo `--tunnel` + ngrok-style URL backendu.

### `Cannot read properties of undefined (reading 'ExpoModulesCore')`
Verze Expo SDK 51 dependencies se rozjely. Spusť:
```bash
npx expo install --check
npx expo install --fix
```
To narovná verze podle `expo` SDK.

### iPad three-pane se nezobrazuje
Layout přepíná podle `useWindowDimensions().width >= 768`. V Expo Go
otoč iPad na šířku, nebo otestuj přes Mac iOS simulator (iPad Pro 11/12.9).
V development build na iPhonu (i Plus modelu) layout zůstává single-pane —
**to je správně**.

### Path aliases (`@theme/*`, `@api/*`) nefungují
TypeScript je rozumí (z `tsconfig.json`), Metro skrze `babel-plugin-module-resolver`
v `babel.config.js`. Pokud aliasy přestaly fungovat:

1. Zkontroluj, že **alias keys v `babel.config.js` jsou shodné** s `paths` v
   `tsconfig.json`. Drift mezi nimi je nejčastější příčina.
2. `npx expo start --clear` — Metro cache musí být po změně babelu invalidovaná.
3. Pokud přidáváš další babel plugin, **vlož ho PŘED `react-native-reanimated/plugin`**,
   jinak workletizace selže.

## App Store submit checklist

Viz `../IMPLEMENTATION_PLAN.md`, sekce **Fáze 4**.

Stručně:

1. Apple Developer Program ($99/rok)
2. App Store Connect — vytvoř app record, bundle id `com.alex.albioncrafting`
3. App icon 1024×1024 (master), splash, screenshoty (iPhone 6.7" + iPad 12.9")
4. Privacy policy URL (live page)
5. App description (cs + en)
6. EAS Build profil `production` → `eas submit -p ios --latest`
7. TestFlight beta → reálný test → submit for review
