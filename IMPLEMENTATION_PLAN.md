# Albion Crafting → iOS App Store: Implementation Plan

**Datum:** 2026-04-26
**Design direction:** Frost & Arcane (V2C) — viz `mockups/variant2_color_frost_arcane.html`
**Status:** Research + plán. Žádné code changes neproběhly.

---

## 1. Co máš dnes — potvrzení stacku

Repo je **čistá Streamlit Python aplikace**. Konkrétně:

- `files/requirements.txt` → `streamlit>=1.32.0`, `requests>=2.31.0`. Nic dalšího.
- `files/app.py` (487 ř.) → `import streamlit as st`, UI postavené na `st.tabs`, `st.sidebar`, `st.session_state`.
- `files/albion_crafting.py` (1949 ř.) → core engine: data fetch z AODP API, profit kalkulace, HTML/CSV/MD report writer.
- Žádný `package.json`, `Podfile`, `pubspec.yaml`, `*.xcodeproj`, žádný React Native ani Capacitor adresář.
- Spouští se přes `streamlit run files/app.py`. Běží jako server (Python proces poslouchá na portu, prohlížeč konzumuje HTML/WebSocket).

UI je dnes **3-tab desktop web**: Equipment, Food, Guide. Sidebar drží všechny parametry. Vše v češtině, dark-only, žádné i18n, žádná11y vrstva, žádné theme tokens — jen Streamlit defaulty + pár inline `<style>` injektnutých přes `st.markdown(unsafe_allow_html=True)`.

---

## 2. Jádro problému — proč Streamlit ≠ App Store

Streamlit **není packageovatelný do iOS App Store**. Žádnou snadnou cestou. Tři důvody, které musíš znát před každým rozhodnutím:

1. **Streamlit běží server-side.** Python proces musí někde žít — nelze ho zabalit do iOS bundle (App Store nepovoluje runtime Python interpret v běžné app, a Streamlit navíc potřebuje Tornado server + WebSocket).
2. **Apple Guideline 4.2 (Minimum Functionality)** — Apple aktivně odmítá aplikace, které jsou "in-app browser of a website". Pure WebView shell přes Streamlit (Capacitor wrap) prošel reviewerům občas v 2020–2022, ale dnes je to jistá zamítka, pokud nepřidáš výraznou native funkcionalitu (push notifs, offline cache, native gestures, sdílení).
3. **PWA cesta nefunguje pro App Store** — PWA na iOS lze přidat na home screen, ale Apple PWA do App Store nesubmituje. Tohle není cesta.

**Závěr:** Streamlit jako runtime pro iOS app **nelze udržet**. Musí se nahradit nebo doplnit.

---

## 3. Tři reálné cesty — pros/cons

### Cesta A: Hybrid wrap (Capacitor / Tauri Mobile přes WebView)

**Jak by to fungovalo:** Streamlit běží na hostingu (Streamlit Cloud, Railway, Fly.io). iOS app je tenký Capacitor wrapper — WebView ukazuje hostovaný Streamlit URL.

**Pros:**
- Nejmíň práce — pár dní práce na wrapper.
- Žádný rewrite logiky, Python zůstává.
- Jeden codebase pro web + mobile.

**Cons:**
- **Vysoká pravděpodobnost zamítnutí App Store reviewem** kvůli Guideline 4.2. Odhaduji 70–85 % šance, že tě odmítnou na první submitu.
- Streamlit UI je **postavené pro desktop browsery** — touch targety jsou malé, sidebar je kompletně mimo mobile UX, podium/three-pane layout z mockupu absolutně nelze postavit ve Streamlit komponentech bez extrémního CSS násilí.
- Vyžaduje stálý server běžící někde s public URL. Latence + offline = zlé.
- Frost & Arcane mockup je **nepostavitelný** ve Streamlit native komponentech. Streamlit nemá podium layout, glow auras, custom card mřížky bez horké HTML/CSS injekce, která se rozbije při každém Streamlit upgradu.

**Verdikt:** Nedoporučuju. Šance na App Store schválení nízká, a i kdyby prošlo, design direction Frost & Arcane v tom postavit nelze.

---

### Cesta B: Plný native rewrite (SwiftUI nebo Flutter)

**Jak by to fungovalo:** Pythonový engine se zahodí. Vše se přepíše nativně — fetch z AODP API, profit kalkulace, UI. Žádný backend.

**Pros:**
- Nejlepší výsledná kvalita. App Store přijme bez problémů.
- Frost & Arcane mockup postavitelný 1:1 (SwiftUI je na to ideální — gradients, glows, animace).
- Offline cache snadná, native iOS APIs k dispozici.
- Žádný server, žádné hosting náklady.

**Cons:**
- **Velký rewrite.** ~1949 řádků analytical Python (`albion_crafting.py`) musíš přepsat do Swiftu nebo Dartu. Včetně edge cases (return rates, focus mechanics, quality multipliers, market tax, station fees) — to je **netriviální math/business logic** a jakýkoli bug v překladu se projeví na špatně spočítaných ziskách.
- Pokud se rozhodneš pro Flutter, ztrácíš část SwiftUI nativnosti (i když Flutter na iOS dnes vypadá výborně).
- iPad three-pane layout z mockupu vyžaduje native size class handling — práce navíc oproti čistě iPhone verzi.
- Recyklujeme **0 % current kódu**. Streamlit + Python vyhodit.

**Odhad práce:**
- SwiftUI cesta: 4–7 týdnů solo, pokud máš základy iOS dev. Bez Swift zkušeností: 2–4 měsíce + učení.
- Flutter cesta: 3–5 týdnů solo, pokud znáš Dart. Bez Flutteru: 6–10 týdnů.

**Verdikt:** Možné, ale drahé na čas. Pythonová logika se zahazuje a riziko překladových bugů v profit math je nezanedbatelné.

---

### Cesta C: Hybrid stack — Python backend + native/RN frontend ⭐ **DOPORUČENO**

**Jak by to fungovalo:**
- **Backend:** Stávající `albion_crafting.py` se obalí do **FastAPI** serveru (~150–250 řádků wrapping kódu). Streamlit se odstaví. Endpointy: `/analyze/equipment`, `/analyze/food`, `/cities`, `/items`. Vrací JSON.
- **Hosting backendu:** Railway / Fly.io / Render — small instance, $5–10/měsíc. Cache odpovědí (price data se mění po hodinách).
- **Mobile frontend:** **React Native + Expo** s TypeScriptem. Theme tokens odpovídající Frost & Arcane palettě, React Navigation pro routing, Zustand nebo TanStack Query pro state/cache.
- **iPad:** Expo podporuje iPad jako first-class target s adaptivními layouty — three-pane mockup je realistický.

**Co jde recyklovat (= ušetříš si práci):**
- ✅ **`albion_crafting.py` celý** — 1949 řádků analytical engine zůstává. Přidáš tenkou FastAPI vrstvu kolem stávajících funkcí (`run_analysis`, `CITY_BONUSES`, `write_html_report` se nepoužije, ale výsledné dataclasses ano).
- ✅ **`leveling_cost.py`, `refining_report.py`, `recipes.py`, `transport.py`** — zůstávají jak jsou.
- ✅ **`item_names_cache.json`, `recipes_cache.json`** — backend si je čte stejně.
- ✅ **AODP integraci** v `requests.get()` voláních — beze změny.

**Co se napíše znovu:**
- ❌ Veškerý Streamlit UI kód v `app.py` (487 ř.) → ekvivalent v React Native (odhadem ~1500–2500 ř. TS/JSX, plus styling).
- ❌ HTML report writer (`write_html_report` ze `albion_crafting.py`) — pokud chceš v app exportovat reporty, přepíše se do PDF generátoru nebo native share sheet. Jinak se prostě odstřihne.

**Pros:**
- **Recykluje 100 % business logiky** — žádný překlad math, žádné překladové bugy. Streamlit je jen UI vrstva, kterou stejně chceme vyhodit.
- App Store schválení bez problémů (RN/Expo apps procházejí běžně, a backend API call není wrapper).
- Frost & Arcane mockup postavitelný — RN podporuje vše: gradients, glows, custom layouts, animace přes Reanimated.
- iPad podporu dostaneš z Expo skoro zadarmo.
- Web verze (pro uživatele kteří chtějí na desktop) může běžet jako Expo Web nebo zůstane Streamlit jako side-by-side. **Nemusíš zabíjet desktop usery.**
- i18n (cs/en) přidáš čistě přes `i18next` nebo `expo-localization`.

**Cons:**
- Backend musíš někde hostovat (~$5–10/měsíc nebo free tier).
- Mírný overhead network roundtripu (oproti čistě native, kde by všechno bylo lokální). Ale price data se beztak fetchují z AODP po síti, takže rozdíl je marginální.
- Pokud nemáš zkušenost s React Native, je tu learning curve (1–2 týdny do produktivity, pokud znáš React).

**Odhad práce (solo, plný úvazek-ekvivalent):**
- FastAPI wrap: **3–5 dní.**
- Expo app skeleton + navigation + theme tokens: **3–5 dní.**
- Equipment screen (mockup main flow): **5–8 dní.**
- Food + Guide screens: **3–5 dní.**
- iPad layout adaptace: **3–5 dní.**
- Polish, animace, glow effects, podium komponenta: **4–6 dní.**
- App Store assets (ikona, screenshoty, splash, privacy strings): **2–3 dny.**
- App Store Connect setup, TestFlight, submit: **2–4 dny** (první submit obvykle žere review iterace).

**Celkem: 4–6 týdnů solo intensive. Realistic part-time: 8–12 týdnů.**

---

## 4. Doporučená cesta + fázovaný plán

**Doporučuju Cestu C (hybrid stack).** Zachová ti analytical engine (kde je celá hodnota repa), umožní postavit Frost & Arcane design pořádně, a App Store ji přijme.

### Fáze 1 — Backend extrakce (1 týden)

**Cíl:** Stávající Python engine běží jako FastAPI služba s JSON API. Streamlit zůstává funkční pro desktop (zatím nezabíjet).

**Práce:**
- Vytvořit `files/api/main.py` s FastAPI app.
- Endpoints: `POST /analyze/equipment`, `POST /analyze/food`, `GET /cities`, `GET /enchants`.
- Cache vrstva (Redis nebo in-memory s TTL 30 min) — AODP rate limity.
- Dockerfile, deploy na Railway/Fly.io/Render.
- CORS pro Expo dev origin.

**Risk:** Nízký. Logika zůstává stejná, jen se obalí.
**Rozhodnutí pro user:** Hosting provider (Railway vs. Fly.io vs. self-hosted VPS). CORS scope.

---

### Fáze 2 — Mobile MVP (2–3 týdny)

**Cíl:** Expo app, která zvládne hlavní flow (equipment analyzer) a vypadá jako Frost & Arcane mockup.

**Práce:**
- `npx create-expo-app albion-forge --template`
- Theme system: tokeny `colors.canvas`, `colors.arcane`, `colors.frost`, `colors.rose`, typescale, spacing.
- React Navigation (bottom tabs: Equipment / Food / Guide / Settings).
- TanStack Query pro fetch + cache.
- Hero card komponenta + Podium komponenta + Leaderboard komponenta — to jsou tři klíčové building blocks z mockupu.
- Settings screen (city, tier, focus, enchants — re-implementace sidebar parametrů).

**Risk:** Střední. Podium animace + glow efekty vyžadují čas. Reanimated v3 + LinearGradient z Expo balíku to ale dají.
**Rozhodnutí pro user:** Expo SDK verze (53 jako stable, 54 beta). Logo crest "A" — má být placeholder, nebo už finální?

---

### Fáze 3 — Feature parity + iPad (1–2 týdny)

**Cíl:** Food a Guide tab funkční, iPad three-pane layout, i18n cs/en.

**Práce:**
- Food screen (jiný analytical flow, jiné parametry).
- Guide screen (statický content, markdown rendering nebo native).
- iPad layout: Expo size classes nebo `useWindowDimensions` + breakpoint switch.
- `i18next` setup, extract strings, cs jako default, en jako fallback.

**Risk:** Nízký, modular práce.
**Rozhodnutí pro user:** Kolik z Guide obsahu má být in-app vs. WebView na externí dokumentaci. EN překlad — kdo? (AI draft + manuální korektury, nebo profesionální překlad).

---

### Fáze 4 — App Store submit prep (1 týden)

**Cíl:** Materiál pro App Store Connect, TestFlight beta, submit.

**Checklist:**
- [ ] Bundle identifier (např. `com.alexjilek.albionforge`)
- [ ] App icon — 1024×1024 master, `expo-asset` generuje rest. Frost & Arcane brand crest.
- [ ] Splash screen — `expo-splash-screen`. Indigo canvas + arcane glow.
- [ ] Screenshoty — 3–5 ks na iPhone 6.7" (mandatory), 3–5 ks na iPad 12.9" (pokud iPad target).
- [ ] App Privacy disclosure (sbíráš jen public AODP data, žádné user data → snadné).
- [ ] Privacy Policy URL (musí být live page, i kdyby jen GitHub Pages).
- [ ] App Store description (cs + en lokalizace).
- [ ] Keywords pro ASO (Albion Online, crafting, profit, calculator…).
- [ ] Apple Developer Program account ($99/rok) — pokud ještě nemáš, **založ teď**, schvalování trvá až 48 h.
- [ ] App Store Connect app record + TestFlight build.
- [ ] Demo accounts pro App Review (pokud login flow — u tebe asi ne).

**Risk:** Apple review může vrátit feedback (1–3 review cykly běžné). Plánuj 1–2 týdny od finálního TestFlight buildu po Live na Storu.
**Rozhodnutí pro user:** Free vs. paid app. In-app purchases (premium tier? Caerleon predictor jako paid feature?). Apple Developer účet — máš?

---

### Fáze 5 (volitelná) — Streamlit jako desktop fallback

Streamlit verzi nemusíš zabíjet. Po Fázi 1 můžeš ji nechat běžet vedle backendu (sdílí stejný `albion_crafting.py` modul) a Streamlit komunita ji bude dál mít. Frost & Arcane redesign na desktop pak řešíš jinak (Streamlit má dnes hodně lepší custom theming než dřív).

**Risk:** Maintenance overhead — dvě UI vrstvy nad jedním engine. Pokud nejsi na to silný, **odstavíš Streamlit po Fázi 4**.

---

## 5. Co user musí rozhodnout teď

1. **Cesta C (hybrid stack) ano/ne?** Tohle je hlavní decision. Pokud ano, jdeme dál.
2. **Mám už Apple Developer Program account ($99/rok)?** Pokud ne, **založ tento týden** — schvalování zabere čas.
3. **Backend hosting** — Railway / Fly.io / vlastní VPS? (Doporučuju Railway na start, free tier stačí.)
4. **i18n scope** — cs only do v1, nebo cs+en ze startu?
5. **iPad target ve v1, nebo iPhone-only release a iPad přidat ve v1.1?** (iPhone-only zkrátí Fázi 2–3 o ~1 týden.)
6. **In-app purchases** — má smysl mít free tier a paid feature, nebo zdarma celé?
7. **Streamlit desktop** — udržovat side-by-side, nebo odstavit po release?

---

## 6. Čeho se NEdělat

- ❌ Nesnaž se Streamlit dostat na iOS App Store. Zamítnou tě.
- ❌ Nepřepisuj `albion_crafting.py` do Swiftu/Dartu — math/business logic ošetřená v Pythonu má cenu. Backend ji udrží.
- ❌ Nezačínej s App Store assets dřív než je Fáze 2 hotová — ikona/screenshoty se budou měnit, jak se UI ustálí.
- ❌ Nepoužívej Tauri Mobile pro tohle — je to v 2026 stále raný stadium pro iOS, a běžní reviewers neznají.

---

## 7. TL;DR

Streamlit do App Store nejde. **Doporučuji Cestu C: FastAPI backend + Expo (React Native) frontend**, recykluješ 100 % své Python analytical logiky a UI postavíš nově podle Frost & Arcane mockupu. Realistická timeline 4–6 týdnů solo full-time, 8–12 týdnů part-time. Hlavní rozhodnutí teď: zda jdeš touto cestou + Apple Developer account.
