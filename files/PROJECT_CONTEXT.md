# PROJECT CONTEXT — Albion Crafting Analyzer v10

Pro pokračování práce v nové konverzaci: zkopíruj obsah tohoto souboru do první zprávy.

## Kdo a co

**Uživatel:** Alex, hraje Albion Online EU server. Premium (10k focus/den). Bridgewatch crafter (bonus: plate armor, crossbow, dagger, hammer, cloth sandals). Všechny crafting nody minimálně T4 base.

**Cíl:** Denní výběr nejziskovějších crafting příležitostí. T4 only zatím.

## Architektura — 3 Python moduly

### `recipes.py`
- `ItemNameLoader` třída — stahuje items.txt z ao-bin-dumps (čitelné názvy)
- `RecipeLoader` — recepty z Gameinfo API
- 2 samostatné cache: `recipes_cache.json` a `item_names_cache.json`
- 4 fallback URL pro items.txt (raw.github + jsdelivr mirrors)

### `transport.py`
- Fast travel fee = `weight_kg × 60 silver/kg`
- Same city = 0, Caerleon = 5% PvP risk
- Zjednodušeno na fast travel only (Alex nechce jezdit pěšky)

### `albion_crafting.py`
- Stahuje ceny + 7-day historie z AODP
- Quality bonus kalkulace (MIN + EXPECTED profit)
- Data freshness indikátor (●)
- Interaktivní HTML dashboard s klikatelnou tabulkou měst
- CSV export

## Fixy v v10 (nejnovější)

- **Caerleon click bug** — fixed. Data atributy `data-margin` a `data-transport-label` se duplicitovaly mezi `<tr>` (data) a `<span>` (display). JS `querySelector` bral první match = TR v tabulce, a přepsal ho textem (margin 123.6) → celý řádek zmizel. Přejmenováno na `data-margin-display` a `data-transport-label-display`.
- **Item names** — `build_item_database()` volá `ItemNameLoader` + HTML renderer má fallback priority: items.txt > cached name_en > item_id format.
- **Alex měl špatné názvy** (`T4 Shoes Plate Set1` místo `Adept's Soldier Boots`) protože Gameinfo API `localizedNames` pole je buď prázdné nebo neexistuje.

## Report karta (aktuální verze)

1. Dvě hero čísla: MIN (Normal) zeleně + EXPECTED (quality) fialově
2. Item name: čitelný (Expert's Crossbow) z ao-bin-dumps
3. Meta: item_id · City bonus · volume · ⚡ quality bonus ≈ +X
4. 🏙️ Kam prodat tabulka s 5 městy, fresh dot, transport fee, 👑 best, **klikatelné**
5. Instructions: vyrob/surovin za/prodej v (s fresh dot), transport fee
6. Dvě profit lines: Minimální zisk (Normal) + Expected zisk (quality)
7. Rozpis surovin s fresh dots + expandable 📍 Ceny v ostatních městech
8. 7-day volume + cena grafy

## Klíčové konstanty

- Focus return rate: 62.9% (focus + city bonus)
- Market tax: 4% (premium)
- Transport fee: 60 silver/kg
- Quality: 68.8% Normal, 25% Good, 5% Outstanding, 1.1% Excellent, 0.1% Masterpiece
- Expected quality multiplier: ~1.054 (5.4% bonus)
- Data freshness: <1h green, 1-6h yellow, 6-24h orange, >24h red

## Default run.bat

```
python albion_crafting.py --city Bridgewatch --tier 4 --top 20 --focus-budget 10000
```

## Files

```
albion_crafting/
├── recipes.py              # Recipe + names loader
├── transport.py            # Fast travel fee
├── albion_crafting.py      # Main analyzer + HTML/CSV
├── run.bat                 # Windows launcher
├── README.md
├── PROJECT_CONTEXT.md      # tento soubor
├── recipes_cache.json      # (generuje se)
├── item_names_cache.json   # (generuje se)
└── reports/                # HTML + CSV výstupy
```

## Historie verzí

- v1-5: Základ, přesné recepty, HTML dashboardy, volume filter, grafy
- v6: Enchant support
- v7: Odstraněn leveling, transport fee, srovnávací tabulka měst
- v8: Čitelné názvy itemů (pokus 1), ceny surovin v městech
- v9: Quality bonus tracker + Fresh data indikátor
- **v10: Fix Caerleon click bug + item names via items.txt (pokus 2 — fungující)**

## TODO pro další kola

🔲 **T5 upgrade** — až Alex doleveluje Expert, `--tier 4,5`
🔲 **Enchanty aktivní** — zatím vypnuté
🔲 **Refining analyzer** — ore → bar
🔲 **Discord webhook** — denní top 5
🔲 **Food/potions** — bug v Gameinfo API
🔲 **Scheduler** — Windows Task Scheduler
🔲 **Crafting spec level** — pokud Alex má vyšší spec, quality bonus bude větší
🔲 **Market depth** — AODP nevrací full orderbook, jen min/max

## Známé limitace

- AODP delay 0-6h (proto fresh dots)
- Fast travel fee = odhad 60/kg (varies 40-80)
- Recepty cached — po patchi smazat `recipes_cache.json`
- Food/potions nejsou v API

## Jak pokračovat v nové konverzaci

1. Otevři novou konverzaci s Claudem
2. Pošli tento soubor jako první zprávu
3. Řekni co chceš přidat/upravit

## Pro Alexe při upgrade

Když dostaneš nový balíček, **smaž staré cache soubory** před prvním spuštěním:
- `recipes_cache.json` (staré má špatná jména)
- `item_names_cache.json` (pokud existuje)

Pak pusť `run.bat` normálně. Stáhne se znovu (~1-2 min).
