# Albion Crafting Analyzer

Denní analýza nejziskovějších crafting příležitostí v Albion Online.

## Funkce

- **Přesné recepty** z Gameinfo API
- **Čitelné názvy itemů** (Expert's Crossbow, Adept's Soldier Armor) z ao-bin-dumps
- **Srovnávací tabulka cen** ve všech Royal Cities s kliknutím pro přepočet
- **Transport fee** pro fast travel mezi městy
- **Quality bonus** — MIN profit (Normal) + EXPECTED profit (s quality RNG)
- **Fresh data indikátor** — barevné tečky podle stáří cen (🟢 <1h, 🟡 1-6h, 🟠 6-24h, 🔴 >24h)
- **7-day grafy** volume + cena pro každý item
- **Rozpis surovin** včetně cen v ostatních městech

## Rychlý start

1. Nainstaluj Python 3.10+ z [python.org](https://www.python.org/downloads/) — zaškrtni "Add Python to PATH"
2. Stáhni všech 6 souborů do jedné složky
3. Dvojklik na `run.bat`

**Pokud aktualizujete ze starší verze:** před prvním spuštěním smaž `recipes_cache.json` — starší verze měly špatná jména itemů v cache.

První spuštění trvá 1-2 minuty (stahují se recepty + item names). Další rychlá díky cache.

## Soubory v balíčku

- `albion_crafting.py` — hlavní analyzer
- `recipes.py` — recepty + čitelné názvy
- `transport.py` — fast travel fee
- `run.bat` — Windows launcher
- `README.md` — návod
- `PROJECT_CONTEXT.md` — briefing pro pokračování v nové konverzaci

## Cache soubory (vytvoří se automaticky)

- `recipes_cache.json` — recepty z Gameinfo API (~500 itemů)
- `item_names_cache.json` — čitelné názvy z ao-bin-dumps (~10,000 itemů)

**Pokud jsou názvy v reportu nešikovné** (typu "T4 Armor Plate Set1" místo "Adept's Soldier Armor"), smaž oba cache soubory a spusť znovu.

## Co uvidíš

V `reports/` se vytvoří `craft_report_YYYY-MM-DD.html` (otevři v prohlížeči) + CSV pro Excel.

### Karta itemu obsahuje:

1. **Hero čísla** — MIN (Normal quality) zeleně + EXPECTED (s quality bonusem) fialově
2. **🏙️ Kam prodat** — tabulka všech měst s cenou, fresh dot, transport fee, profit (klikatelné!)
3. **Instructions** — vyrob X ks, nakup suroviny za Y, prodej v Z
4. **Rozpis surovin** — s 📍 srovnáním měst kde nakoupit
5. **Volume + cena graf** za 7 dní

### Fresh data indikátor

Barevná tečka po ceně podle stáří dat (hover pro detail):
- 🟢 Zelená: <1h (čerstvé)
- 🟡 Žlutá: 1-6h (OK)
- 🟠 Oranžová: 6-24h (starší)
- 🔴 Červená: >24h (NEDŮVĚRYHODNÁ — zkontroluj v hře!)

### Quality bonus

Albion dává RNG quality rolls (68.8% Normal, 25% Good, 5% Outstanding...). Vyšší quality = vyšší prodejní cena.
- **MIN** = garantovaný minimální zisk (když vše spadne na Normal)
- **EXPECTED** = průměrný zisk včetně quality bonusů (typicky +5-10%)

## Aktuální nastavení

- **Město**: Bridgewatch
- **Tier**: T4 (T5 přepneš v run.bat až doleveluješ Expert nody)
- **Focus budget**: 10,000/den
- **Min volume**: 10 kusů/den

## CLI parametry

```
python albion_crafting.py --city Bridgewatch --tier 4 --top 20 --focus-budget 10000
```

- `--city` — Bridgewatch, Martlock, Lymhurst, Thetford, Fort Sterling, Caerleon
- `--tier` — např. `4` nebo `4,5,6`
- `--enchants` — `0` (base), `0,1,2,3` (vše)
- `--top` — kolik itemů zobrazit
- `--focus-budget` — focus/den (default 10000)
- `--min-volume` — min denní volume (default 10, `0` = bez filtru)
- `--no-caerleon` — skip Caerleon (PvP risk)

## Workflow

1. **Ráno pusť** `run.bat`
2. Otevři `reports/craft_report_*.html`
3. **Klikni na různá města** v tabulce pro přepočet profitu
4. **Ověř fresh dots** — pokud je většina cen červená, AODP nemá aktuální data, mrkni v hře
5. Rozhoduj se mezi MIN a EXPECTED — MIN je jistota, EXPECTED je průměr
6. Craftuj → prodej → žij

## Zdroje dat

- **Recepty**: Gameinfo API (Sandbox Interactive)
- **Názvy itemů**: ao-bin-dumps (community repo z binárních dumpů)
- **Ceny & volume**: Albion Data Project (community)
- **Transport fee**: Model 60 silver/kg (fast travel Royal Cities)

## Doporučení pro lepší fresh data

Nainstaluj **AFM Data Client** z https://albionfreemarket.com/data-client
- Nech ho běžet když hraješ
- Sám uploadne ceny které vidíš v market UI
- Tvoje data jdou okamžitě na AODP = máš zelené fresh dots pro co jsi prošel

## Kam dál

- **Enchanty** — `--enchants 0,1,2,3`
- **Discord webhook** — denní summary
- **Refining analyzer** — ore → bar
- **Food/potions** — bug v Gameinfo API, potřebuje alternativní zdroj
- **Scheduler** — Windows Task Scheduler

Pokud budeš pokračovat v nové konverzaci, přilož `PROJECT_CONTEXT.md` jako první zprávu.
