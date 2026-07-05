"""
Albion Online Crafting Profit Analyzer
=======================================
Stahuje aktuální ceny z Albion Online Data Project (AODP) a počítá marži
pro craftitelné itemy. Podporuje focus i bez focusu, s city bonusem i bez.

Použití:
    python albion_crafting.py --city Martlock --tier 4,5,6,7,8 --top 30

Výstup:
    - craft_report_YYYY-MM-DD.csv (plný dataset)
    - craft_report_YYYY-MM-DD.md (top X nejziskovějších)
"""

import argparse
import csv
import json
import statistics
import sys
import threading
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

import requests

# ============================================================
# KONFIGURACE
# ============================================================

# AODP base URL (europe server - pokud hraješ na Americas, změň na "west", Asia = "east")
AODP_BASE = "https://europe.albion-online-data.com/api/v2/stats"

# AODP je komunitní služba. Auto režim umí stejný price/history batch potřebovat
# pro několik craft cities, takže držíme krátkou in-memory cache a globální
# throttle. Bez toho API rychle vrací 429 Too Many Requests.
AODP_CACHE_TTL_SECONDS = 10 * 60
AODP_MIN_REQUEST_INTERVAL_SECONDS = 0.45
_AODP_CACHE = {}
_AODP_LOCK = threading.Lock()
_AODP_LAST_REQUEST_AT = 0.0

# City bonusy - každé město má bonus na určité kategorie itemů
# Bonus = +crafting return rate (default je ~15.2%, s bonusem ~24.8%, s focusem až ~53%)
CITY_BONUSES = {
    "Bridgewatch":    ["CROSSBOW", "DAGGER", "CURSED_STAFF", "PLATE_ARMOR", "CLOTH_SANDALS"],
    "Martlock":       ["AXE", "QUARTERSTAFF", "FROST_STAFF", "PLATE_SHOES", "OFFHAND", "SHIELD", "TORCH", "HORN", "BOOK", "ORB"],
    "Lymhurst":       ["SWORD", "BOW", "ARCANE_STAFF", "LEATHER_HELMET", "LEATHER_SHOES"],
    "Thetford":       ["MACE", "NATURE_STAFF", "FIRE_STAFF", "LEATHER_ARMOR", "CLOTH_HELMET"],
    "Fort Sterling":  ["HAMMER", "SPEAR", "HOLY_STAFF", "PLATE_HELMET", "CLOTH_ARMOR"],
    "Caerleon":       [],  # food/gathering/tools mají vlastní mapu níže
}

# Return rate (chance, že dostaneš resource zpátky při craftu)
# Hodnoty odpovídají craftingu v Royal City; hideout bez focusu dává víc, ale
# pro jednoduchost (a protože hideouty jsou v outlands, což je PvP) předpokládám město.
RR_NO_FOCUS_BASE = 0.152        # bez focus, bez city bonusu (Royal City)
RR_NO_FOCUS_BONUS = 0.362       # bez focus, s city bonusem (+21% bonus)
RR_FOCUS_BASE = 0.479           # s focus, bez city bonusu
RR_FOCUS_BONUS = 0.629          # s focus, s city bonusem

# Crafting spec bonus k return rate
# Každý spec level přidává ~0.3% k return rate (komunitní data, approximate)
# Spec level 4 (T4 nody) = +1.2% → zaokrouhleno na 0.012
RR_SPEC_BONUS_PER_LEVEL = 0.003  # 0.3% za level

# Ručně zadaný Activities production bonus z herního tabu Activities.
# Albion ho popisuje jako +10% return rate; držíme ho odděleně od city bonusu,
# protože aktuální daily bonus nejde spolehlivě načíst z veřejného API.
ACTIVITY_RETURN_RATE_BONUS = 0.10

# Market tax (prodej přes sell order s premium = 4%, bez premium = 8%)
MARKET_TAX = 0.04               # předpokládáme premium
BLACK_MARKET_CITY = "Black Market"
BLACK_MARKET_TRANSPORT_CITY = "Caerleon"

# Station fee — průměrný poplatek za craftovací stanici v Royal City
# Typicky 1-3% z nominal cost surovin, default 1.5%
STATION_FEE_RATE = 0.015        # 1.5% z nominal cost

# Quality roll tabulka - base chances bez crafting spec bonusu
# Zdroj: Korn (SBI dev) na Albion foru
# https://forum.albiononline.com/index.php/Thread/67684-Crafting-quality-chance/
QUALITY_CHANCES = {
    1: 0.688,   # Normal (no bonus IP)
    2: 0.250,   # Good (+10 IP)
    3: 0.050,   # Outstanding (+20 IP)
    4: 0.011,   # Excellent (+50 IP)
    5: 0.001,   # Masterpiece (+100 IP)
}

# Price multipliers pro každou quality (empiricky z marketu, varies per item)
# Normal = baseline = 1.0, ostatní jsou odhad průměrného cenového navýšení
QUALITY_PRICE_MULT = {
    1: 1.00,   # Normal
    2: 1.10,   # Good
    3: 1.30,   # Outstanding
    4: 2.00,   # Excellent
    5: 4.00,   # Masterpiece
}

def calculate_expected_quality_multiplier(spec_level=0):
    """
    Spočítá očekávaný quality multiplier jako vážený průměr.
    spec_level = 0 znamená bez crafting spec (1 roll), wacky.

    Pro běžný spec level (0-100) použijeme base chance bez modifikace.
    V budoucnu by se dalo přidat skutečné rerolls z spec.
    """
    expected = 0
    for q, chance in QUALITY_CHANCES.items():
        expected += chance * QUALITY_PRICE_MULT[q]
    return expected  # typicky ~1.09 (9% bonus navíc oproti normal)


# Thresholdy pro fresh data indikátor (v hodinách)
DATA_FRESHNESS_GREEN = 1    # < 1h = čerstvé
DATA_FRESHNESS_YELLOW = 6   # 1-6h = OK
DATA_FRESHNESS_ORANGE = 24  # 6-24h = starší
# > 24h = červené

# Tier → resource T4, T5, T6 ... (platí T-1 pro 50% surovin u T5+)
# V Albionu vyšší tier item potřebuje suroviny mixem T-1 a T-0
# Např T5 chestplate = 16× T5 metal bar + 8× T5 cloth NEBO podle receptu


# ============================================================
# ITEM DATABASE s přesnými recepty z Gameinfo API
# ============================================================

# Seznam itemů, které chceme analyzovat (klíče do receptů)
# Kategorie je pro matching s city bonusy
ITEM_KEYS = {
    # Plate armor - Bridgewatch + Fort Sterling bonus
    "HEAD_PLATE_SET1":  "PLATE_HELMET",
    "ARMOR_PLATE_SET1": "PLATE_ARMOR",
    "SHOES_PLATE_SET1": "PLATE_SHOES",
    # Leather armor - Lymhurst bonus
    "HEAD_LEATHER_SET1":  "LEATHER_HELMET",
    "ARMOR_LEATHER_SET1": "LEATHER_ARMOR",
    "SHOES_LEATHER_SET1": "LEATHER_SHOES",
    # Cloth armor - Thetford bonus (boty pro Bridgewatch)
    "HEAD_CLOTH_SET1":  "CLOTH_HELMET",
    "ARMOR_CLOTH_SET1": "CLOTH_ARMOR",
    "SHOES_CLOTH_SET1": "CLOTH_SANDALS",
    # Zbraně jednoruční
    "MAIN_SWORD":       "SWORD",
    "MAIN_AXE":         "AXE",
    "MAIN_MACE":        "MACE",
    "MAIN_HAMMER":      "HAMMER",
    "MAIN_DAGGER":      "DAGGER",
    "MAIN_SPEAR":       "SPEAR",
    # Zbraně obouruční
    "2H_QUARTERSTAFF":  "QUARTERSTAFF",
    "2H_BOW":           "BOW",
    "2H_CROSSBOW":      "CROSSBOW",
    "MAIN_FIRESTAFF":   "FIRE_STAFF",
    "MAIN_FROSTSTAFF":  "FROST_STAFF",
    "MAIN_HOLYSTAFF":   "HOLY_STAFF",
    "MAIN_NATURESTAFF": "NATURE_STAFF",
    "MAIN_CURSEDSTAFF": "CURSED_STAFF",
    "MAIN_ARCANESTAFF": "ARCANE_STAFF",
}


# ============================================================
# FOOD / MEAL DATABASE (T3-T8)
# ============================================================
# Jídla v Albionu (crafting stanice: Cook). Naming convention:
#   T3_MEAL_{TYPE}                 (base variant u nižších tierů)
#   T4-T8_MEAL_{TYPE}_{INGREDIENT} (vyšší tier má proteinový/zeleninový suffix)
#
# Každá entry je buď jen key suffix (pokud ID = T{tier}_{key}),
# nebo list variant suffixů pro každý tier (kdy T{tier}_MEAL_{TYPE}_{suffix}).
# Pokud některé ID neexistuje, recipe_loader vrátí None a item se přeskočí.
FOOD_ITEM_KEYS = {
    # Chlebový (pie) — Martlock
    "MEAL_PIE":      "PIE",
    # Polévka — Lymhurst
    "MEAL_SOUP":     "SOUP",
    # Dušené — Martlock
    "MEAL_STEW":     "STEW",
    # Salát — Thetford
    "MEAL_SALAD":    "SALAD",
    # Sendvič — Fort Sterling
    "MEAL_SANDWICH": "SANDWICH",
    # Omeleta — Bridgewatch
    "MEAL_OMELETTE": "OMELETTE",
    # Pečínka — Fort Sterling
    "MEAL_ROAST":    "ROAST",
}

# City bonusy pro vaření. Aktuální royal bonus pro hotová jídla je Caerleon;
# ostatní města mají farmářské/ingredient bonusy, ne meal crafting bonus.
FOOD_CITY_BONUSES = {
    "Martlock":       [],
    "Bridgewatch":    [],
    "Lymhurst":       [],
    "Thetford":       [],
    "Fort Sterling":  [],
    "Caerleon":       ["PIE", "SOUP", "STEW", "SALAD", "SANDWICH", "OMELETTE", "ROAST"],
}

ACTIVITY_CATEGORY_ALIASES = {
    "COMMON_ARCANESTAFF": "ARCANE_STAFF",
    "COMMON_CURSESTAFF": "CURSED_STAFF",
    "COMMON_FIRESTAFF": "FIRE_STAFF",
    "COMMON_FROSTSTAFF": "FROST_STAFF",
    "COMMON_HOLYSTAFF": "HOLY_STAFF",
    "COMMON_NATURESTAFF": "NATURE_STAFF",
    "COMMON_CLOTH_SHOES": "CLOTH_SANDALS",
    "CLOTH_SHOES": "CLOTH_SANDALS",
}


def normalize_activity_bonus_category(category: str) -> str:
    """Sjednotí kódy z Albion Database/Activities na interní category kódy."""
    normalized = (category or "").strip().upper()
    if normalized in ACTIVITY_CATEGORY_ALIASES:
        return ACTIVITY_CATEGORY_ALIASES[normalized]
    if normalized.startswith("COMMON_"):
        normalized = normalized.removeprefix("COMMON_")
    return ACTIVITY_CATEGORY_ALIASES.get(normalized, normalized)


def normalize_activity_bonus_categories(categories) -> set[str]:
    return {normalize_activity_bonus_category(category) for category in categories or [] if category}


def activity_bonus_applies_to_item(item_category: str, activity_bonus_categories) -> bool:
    active = normalize_activity_bonus_categories(activity_bonus_categories)
    category = normalize_activity_bonus_category(item_category)
    if category in active:
        return True
    # COMMON_FOOD v Activities znamená food production obecně, zatímco engine
    # rozpadá jídla na PIE/SOUP/STEW/... kvůli city bonusům.
    return "FOOD" in active and category in set(FOOD_ITEM_KEYS.values())


def _clamp_return_rate(return_rate: float) -> float:
    return max(0.0, min(0.95, return_rate))

# Tierové varianty — jídla v Albionu mají různé ingredient suffixy podle typu.
# Strategie: zkoušíme VŠECHNY známé suffixy (+ fallback "" bez suffixu).
# Recipe loader vrátí None pro neexistující, první match vyhraje v _resolve_food_item_id.
# Seznam suffixů pokrývá všechny reálné varianty z ao-bin-dumps.
# Pořadí: konkrétní ingredient suffixy NEJDŘÍV (preferujeme specifické varianty
# jako T5_MEAL_PIE_FISH), pak až prázdný suffix (T3_MEAL_PIE) jako fallback.
_ALL_MEAL_SUFFIXES = [
    "_FISH", "_PORK", "_BEEF", "_CHICKEN", "_GOOSE", "_MUTTON",
    "_POTATO", "_WHEAT", "_CORN", "_TURNIP", "_CARROT", "_CABBAGE",
    "_BEAN", "_PUMPKIN", "_EGG", "_CHEESE", "_HONEY", "_MILK",
    "",  # fallback pro base (nízké tiery bez suffixu)
]
# Generujeme tier → všechny suffixy. Recipe loader to filtruje na existující.
FOOD_TIER_VARIANTS = {
    cat: {tier: _ALL_MEAL_SUFFIXES for tier in range(3, 9)}
    for cat in ("PIE", "SOUP", "STEW", "SALAD", "SANDWICH", "OMELETTE", "ROAST")
}


def data_freshness_dot(timestamp_str: str) -> str:
    """
    Vrátí barevnou tečku podle stáří dat.

    AODP timestamp je ve formátu "2026-04-21T08:15:00"
    Vrací HTML span s barvou a tooltipem (hodiny stáří).
    """
    if not timestamp_str:
        return '<span class="fresh-dot fresh-unknown" title="neznámé stáří">●</span>'

    try:
        from datetime import datetime, timezone
        # Parse timestamp (AODP vrací UTC bez tz info)
        if timestamp_str.endswith("Z"):
            timestamp_str = timestamp_str[:-1]
        dt = datetime.fromisoformat(timestamp_str)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)
        age_hours = (now - dt).total_seconds() / 3600

        if age_hours < DATA_FRESHNESS_GREEN:
            cls = "fresh-green"
            label = f"<1h stará (čerstvé)"
        elif age_hours < DATA_FRESHNESS_YELLOW:
            cls = "fresh-yellow"
            label = f"{age_hours:.1f}h stará"
        elif age_hours < DATA_FRESHNESS_ORANGE:
            cls = "fresh-orange"
            label = f"{age_hours:.0f}h stará (starší)"
        else:
            if age_hours < 48:
                label_age = f"{age_hours:.0f}h stará"
            else:
                label_age = f"{age_hours/24:.1f} dne stará"
            cls = "fresh-red"
            label = f"{label_age} (NEDŮVĚRYHODNÁ)"

        return f'<span class="fresh-dot {cls}" title="{label}">●</span>'
    except Exception:
        return '<span class="fresh-dot fresh-unknown" title="chyba parsování času">●</span>'


def _enchant_resource_id(res_id: str, enchant_level: int) -> str:
    """
    Převede ID suroviny na enchanted variantu.
    T4_METALBAR → T4_METALBAR_LEVEL1@1 (pro .1), _LEVEL2@2 (pro .2), atd.

    Fungují tak refined resources (bar, plank, leather, cloth).
    Raw resources (ORE, WOOD, HIDE, FIBER) se přímo enchantují taky:
    T4_ORE → T4_ORE_LEVEL1@1
    """
    if enchant_level == 0:
        return res_id
    return f"{res_id}_LEVEL{enchant_level}@{enchant_level}"


def _enchant_item_id(item_id: str, enchant_level: int) -> str:
    """
    Pro hotový item:
    T4_ARMOR_PLATE_SET1 → T4_ARMOR_PLATE_SET1@1 (.1), @2 (.2), @3 (.3)
    """
    if enchant_level == 0:
        return item_id
    return f"{item_id}@{enchant_level}"


def _resolve_food_item_id(tier: int, key: str, recipes_available: dict) -> str:
    """
    Pro jídlo: najdi skutečný item_id v daném tieru.
    Některá jídla v T4+ mají ingredient suffix (_FISH, _PORK).
    Zkusí varianty podle FOOD_TIER_VARIANTS a vrátí první, které existuje v recipes.
    """
    # key = "MEAL_PIE" → category = "PIE"
    category = FOOD_ITEM_KEYS.get(key, "")
    variants = FOOD_TIER_VARIANTS.get(category, {}).get(tier, [""])
    for suffix in variants:
        candidate = f"T{tier}_{key}{suffix}"
        if candidate in recipes_available and recipes_available[candidate] is not None:
            return candidate
    # Poslední fallback: jen base bez suffixu
    return f"T{tier}_{key}"


def build_item_database(tiers, recipe_loader, enchant_levels=None, mode="equipment"):
    """
    Postaví DB itemů s PŘESNÝMI recepty z Gameinfo API.

    enchant_levels: list [0, 1, 2, 3] kde 0 = base, 1 = .1, 2 = .2, 3 = .3
                    Default: [0] (jen base tier, bez enchantů)
    mode: "equipment" (default) nebo "food" — food používá FOOD_ITEM_KEYS
          a ignoruje enchant_levels (jídla se neenchantují).
    """
    if enchant_levels is None:
        enchant_levels = [0]

    # Pro food: skip enchant logiku (jídla nemají enchanty)
    if mode == "food":
        enchant_levels = [0]
        item_keys = FOOD_ITEM_KEYS
    else:
        item_keys = ITEM_KEYS

    items = []

    # Načti item names z ao-bin-dumps (jen jednou, pak z cache)
    from app.core.recipes import ItemNameLoader
    name_loader = ItemNameLoader()

    # Posbíráme base recepty PLUS tier+ench ekvivalenty.
    # Důvod: focus cost u enchantovaných itemů JE vyšší než u base.
    # V Albionu má T4.N stejný Item Value jako T(4+N).0, a focus se odvíjí od IV.
    # Takže T4.2 cloth sandals = focus cost T6 cloth sandals = 1313 (ne 429).
    # Empiricky ověřeno přes recipes_cache: 429 -> 750 -> 1313 (×1.75 per tier).
    all_item_ids = set()

    # Pro food: nejdřív zkusíme vytáhnout meal IDs PŘÍMO z bulk dumpu.
    # Tohle je spolehlivější než hádat suffixy přes FOOD_TIER_VARIANTS,
    # protože bulk dump obsahuje přesně ty itemy, co existují ve hře.
    food_ids_from_dump = []
    if mode == "food":
        try:
            food_ids_from_dump = recipe_loader.get_meal_ids_for_tiers(list(tiers))
        except Exception as e:
            print(f"[!] Chyba při získávání meal IDs z bulk dumpu: {e}")
        all_item_ids.update(food_ids_from_dump)

    # Pokud food code path má autoritativní list z items.txt
    # (`get_meal_ids_for_tiers`), brute-force fallback přes FOOD_TIER_VARIANTS
    # nepotřebujeme — jen by zbytečně přidal ~530 invented IDs co Gameinfo API
    # vrátí 404 (a celý request přesáhne 120s mobile timeout).
    skip_food_fallback = mode == "food" and bool(food_ids_from_dump)

    for tier in tiers:
        for key in item_keys:
            if mode == "food":
                if skip_food_fallback:
                    continue
                # Fallback: pokud items.txt loader selhal, zkus všechny permutace
                # z FOOD_TIER_VARIANTS — pomalé, ale lepší než nic.
                category = item_keys[key]
                for suffix in FOOD_TIER_VARIANTS.get(category, {}).get(tier, [""]):
                    all_item_ids.add(f"T{tier}_{key}{suffix}")
            else:
                all_item_ids.add(f"T{tier}_{key}")
                # Přidej i tier+ench ekvivalent pro přesný focus_cost z API
                for ench in enchant_levels:
                    if ench > 0:
                        eq_tier = tier + ench
                        if eq_tier <= 8:  # T8 je max tier v Albionu
                            all_item_ids.add(f"T{eq_tier}_{key}")

    # Batch download receptů (base + tier+ench ekvivalenty pro focus cost)
    recipes = recipe_loader.preload_recipes(sorted(all_item_ids))

    # Pro food mode: pokud máme meal IDs z bulk dumpu, postavíme items přímo z nich
    # (bez průchodu FOOD_ITEM_KEYS). To nám dá kompletní seznam.
    if mode == "food" and food_ids_from_dump:
        print(f"[build_item_database] food mode: {len(food_ids_from_dump)} meal IDs z dumpu, "
              f"{sum(1 for iid in food_ids_from_dump if recipes.get(iid))} má recept")
        items = []
        for iid in food_ids_from_dump:
            recipe = recipes.get(iid)
            if recipe is None:
                continue
            # Parse tier & category z ID: T{X}_MEAL_{CAT}_{...}
            try:
                parts = iid.split("_")
                tier = int(parts[0][1:])  # "T5" -> 5
                category = parts[2]  # "PIE", "SOUP", ...
            except (ValueError, IndexError):
                continue
            real_name = name_loader.get_name(iid)
            resources_dict = {res["id"]: res["count"] for res in recipe["resources"]}
            items.append({
                "item_id": iid,
                "base_item_id": iid,
                "name_en": real_name or recipe.get("name_en", iid),
                "name_cs": recipe.get("name_cs", ""),
                "category": category,
                "tier": tier,
                "enchant_level": 0,
                "resources": resources_dict,
                "focus_cost": recipe["focus_cost"],
                "silver_fee": recipe["silver_fee"],
            })
        print(f"[build_item_database] food mode: vráceno {len(items)} itemů")
        return items

    # Fallback multiplier pokud API nevrátí recept pro tier+ench ekvivalent
    ENCH_FOCUS_MULT = 1.75  # potvrzeno z cache: 429 -> 750 -> 1313 (T4->T5->T6)

    # Postavíme DB pro každou kombinaci tier × enchant level
    missing = []
    for tier in tiers:
        for key, category in item_keys.items():
            # Pro food: resolve actual item_id (s/bez suffixu) podle tieru
            if mode == "food":
                base_item_id = _resolve_food_item_id(tier, key, recipes)
            else:
                base_item_id = f"T{tier}_{key}"
            recipe = recipes.get(base_item_id)
            if recipe is None:
                missing.append(base_item_id)
                continue

            # Získej reálný název z items.txt
            real_name = name_loader.get_name(base_item_id)

            for ench in enchant_levels:
                # Item ID s enchant suffixem
                enchanted_item_id = _enchant_item_id(base_item_id, ench)
                # Suroviny: všechny se enchantují na stejný level
                resources_dict = {
                    _enchant_resource_id(res["id"], ench): res["count"]
                    for res in recipe["resources"]
                }

                # Focus cost: T4.N má IV jako T(4+N).0, proto bereme focus
                # z tier+ench ekvivalentu. Fallback: base × 1.75^ench.
                if ench == 0:
                    focus_cost = recipe["focus_cost"]
                else:
                    eq_tier = tier + ench
                    eq_id = f"T{eq_tier}_{key}"
                    eq_recipe = recipes.get(eq_id) if eq_tier <= 8 else None
                    if eq_recipe and eq_recipe.get("focus_cost"):
                        focus_cost = eq_recipe["focus_cost"]
                    else:
                        focus_cost = round(recipe["focus_cost"] * (ENCH_FOCUS_MULT ** ench))

                items.append({
                    "item_id": enchanted_item_id,
                    "base_item_id": base_item_id,
                    "name_en": real_name or recipe.get("name_en", base_item_id),
                    "name_cs": recipe.get("name_cs", ""),
                    "category": category,
                    "tier": tier,
                    "enchant_level": ench,
                    "resources": resources_dict,
                    "focus_cost": focus_cost,
                    "silver_fee": recipe["silver_fee"],
                })

    if missing:
        print(f"[!] Recept nenalezen pro {len(missing)} itemů: {missing[:5]}{'...' if len(missing) > 5 else ''}")

    return items


# ============================================================
# AODP API VOLÁNÍ
# ============================================================

def _aodp_get_json(url, *, label):
    """
    GET JSON z AODP s TTL cache, globálním throttlem a retry pro 429.

    Cache je záměrně per-process. Backend v Phase 1 běží single worker; pokud
    ho později škálujeme, nahradit Redisem nebo cachetools TTLCache.
    """
    now = time.time()
    with _AODP_LOCK:
        cached = _AODP_CACHE.get(url)
        if cached and now - cached["stored_at"] < AODP_CACHE_TTL_SECONDS:
            return cached["data"]

    last_exc = None
    for attempt in range(4):
        with _AODP_LOCK:
            global _AODP_LAST_REQUEST_AT
            wait = AODP_MIN_REQUEST_INTERVAL_SECONDS - (time.monotonic() - _AODP_LAST_REQUEST_AT)
            if wait > 0:
                time.sleep(wait)
            _AODP_LAST_REQUEST_AT = time.monotonic()

        try:
            resp = requests.get(url, headers={"Accept-Encoding": "gzip"}, timeout=30)
            if resp.status_code == 429:
                retry_after = resp.headers.get("Retry-After")
                try:
                    delay = float(retry_after) if retry_after else 2.0 * (attempt + 1)
                except ValueError:
                    delay = 2.0 * (attempt + 1)
                delay = min(max(delay, 2.0), 12.0)
                print(
                    f"  [!] AODP 429 ({label}), čekám {delay:.1f}s a zkusím znovu "
                    f"({attempt + 1}/4)",
                    file=sys.stderr,
                )
                time.sleep(delay)
                continue
            resp.raise_for_status()
            data = resp.json()
            with _AODP_LOCK:
                _AODP_CACHE[url] = {"stored_at": time.time(), "data": data}
            return data
        except requests.RequestException as exc:
            last_exc = exc
            delay = min(1.5 * (attempt + 1), 6.0)
            if attempt < 3:
                print(
                    f"  [!] Chyba AODP ({label}): {exc}; retry za {delay:.1f}s",
                    file=sys.stderr,
                )
                time.sleep(delay)

    print(f"  [!] Chyba AODP ({label}): {last_exc}", file=sys.stderr)
    return None


def fetch_prices(item_ids, locations, quality=1):
    """
    Stáhne aktuální ceny z AODP.
    Vrací dict: {(item_id, location): {"sell_min": X, "buy_max": Y, "updated": timestamp}}
    """
    # AODP má limit 4096 znaků na URL, musíme batchovat
    BATCH_SIZE = 50
    prices = {}

    for i in range(0, len(item_ids), BATCH_SIZE):
        batch = item_ids[i:i + BATCH_SIZE]
        items_param = ",".join(batch)
        locations_param = ",".join(quote(city, safe="") for city in locations)
        url = f"{AODP_BASE}/prices/{items_param}.json?locations={locations_param}&qualities={quality}"

        data = _aodp_get_json(url, label="prices")
        if data is None:
            continue

        for row in data:
            key = (row["item_id"], row["city"])
            prices[key] = {
                "sell_min": row.get("sell_price_min", 0) or 0,
                "buy_max": row.get("buy_price_max", 0) or 0,
                "sell_updated": row.get("sell_price_min_date", ""),
                "buy_updated": row.get("buy_price_max_date", ""),
            }

    return prices


# ============================================================
# OUTLIER FILTER (mode-agnostic — equipment i food)
# ============================================================
#
# AODP občas vrátí "misclick listing" — jeden hráč si dal item za absurdní
# cenu (typicky o 1-2 řády vyšší, např. 47M místo 470k). Engine by to vzal
# za bernou minci a označil item za "champion s 47M profitem", což je BS.
#
# Dvě úrovně detekce:
#
# 1) **Median + threshold** (≥3 měst s validní cenou)
#    Pokud sell_min v daném městě se liší o víc než `threshold` (default 80%)
#    od *mediánu* ostatních měst, vynuluje se.
#
#    Proč median, ne mean: median je robustní proti samotnému outlieru. Mean
#    tahá outlierová cena nahoru a "průměr" se zkresluje natolik, že by
#    downstream porovnání selhalo (legitimní ceny by byly hodnoceny jako
#    outliery proti zkreslenému průměru).
#
# 2) **Ratio fallback** (2 města, typicky food / T8 specialty items)
#    Food má často data jen ve 2 městech (food market je tenký). Median na
#    2 hodnotách neumí rozhodnout, kde je outlier. Použijeme ratio test:
#    pokud max / min > `ratio_threshold` (default 10×), je max téměř jistě
#    misclick — vynuluje se. 10× je dost benevolentní, aby legit price
#    variance (město A má 5× cenu města B kvůli low supply) prošla, ale
#    typický misclick (100× normal) je vychytán.
#
# Engine downstream zachází se sell_min=0 jako "no AODP data" → item-city
# kombinace se přirozeně přeskočí, není potřeba měnit downstream logiku.
def _filter_outlier_sell_prices(
    prices, threshold=0.80, min_cities=3, ratio_threshold=10.0,
):
    """
    Najde a vynuluje outlier sell_min ceny napříč městy.

    prices: dict {(item_id, city): {"sell_min": int, ...}} — *mutuje se in-place*
    threshold: max povolená odchylka od mediánu (0.80 = ±80 %)
    min_cities: pod tenhle počet měst přepnout na ratio fallback
    ratio_threshold: pro 2-city případ — pokud max/min > N, flagujeme max

    Vrací list filtrovaných záznamů: [(item_id, city, original_price, ref), ...]
    kde `ref` je median (pro median path) nebo "ratio" string (pro fallback).
    """
    by_item = defaultdict(dict)
    for (item_id, city), data in prices.items():
        sm = data.get("sell_min", 0) or 0
        # Zero = "no AODP data" — neúčastní se mediánu ani filtru
        if sm > 0:
            by_item[item_id][city] = sm

    filtered = []
    for item_id, city_prices in by_item.items():
        n = len(city_prices)

        if n >= min_cities:
            # Primary: median-based check
            med = statistics.median(city_prices.values())
            if med <= 0:
                continue

            for city, price in city_prices.items():
                deviation = abs(price - med) / med
                if deviation > threshold:
                    prices[(item_id, city)]["sell_min"] = 0
                    filtered.append((item_id, city, price, int(med)))

        elif n == 2:
            # Fallback: ratio test (typicky food T7+/T8 specialty)
            cities_sorted = sorted(city_prices.items(), key=lambda kv: kv[1])
            (low_city, low_price), (high_city, high_price) = cities_sorted

            if low_price <= 0:
                continue

            ratio = high_price / low_price
            if ratio > ratio_threshold:
                # Vyhazujeme HIGH (typický misclick je vždy nahoru, dolů by hráč
                # neudělal — sám by si zkrátil prachy). Pokud by se ukázalo, že
                # i low jsou misclicky, lze přidat sanity check proti history.
                prices[(item_id, high_city)]["sell_min"] = 0
                filtered.append(
                    (item_id, high_city, high_price, f"ratio {ratio:.1f}× vs {low_price:,}")
                )
        # n == 1 nebo 0 → nelze rozhodnout, necháme tak

    return filtered


def _format_outlier_ref(ref):
    """Outlier ref muze byt median int nebo ratio popis; string neformatujeme jako cislo."""
    return f"{ref:,}" if isinstance(ref, (int, float)) else str(ref)


def fetch_history(item_ids, locations, days=7, quality=1):
    """
    Stáhne historii cen z AODP za posledních N dní.
    time-scale=24 = denní agregace (pro graf za týden stačí)

    Vrací dict: {(item_id, city): [{date, avg_price, item_count}, ...]}
    """
    BATCH_SIZE = 30  # history endpoint je pomalejší, menší batch
    history = {}

    for i in range(0, len(item_ids), BATCH_SIZE):
        batch = item_ids[i:i + BATCH_SIZE]
        items_param = ",".join(batch)
        locations_param = ",".join(quote(city, safe="") for city in locations)
        # time-scale=24 = daily aggregation
        url = (f"{AODP_BASE}/history/{items_param}.json"
               f"?locations={locations_param}&qualities={quality}&time-scale=24")

        data = _aodp_get_json(url, label="history")
        if data is None:
            continue

        # Odpověď je list objektů { item_id, location, data: [{timestamp, avg_price, item_count}] }
        # AODP někdy vrací i staré body (week-old / month-old) pokud se item neobchoduje.
        # Musíme filtrovat podle skutečného timestampu, ne brát poslední N bodů,
        # jinak by graf zobrazil měsíc staré ceny jako by byly "posledních N dní".
        from datetime import datetime, timezone, timedelta
        cutoff_dt = datetime.now(timezone.utc) - timedelta(days=days)

        def _parse_ts(ts):
            if not ts:
                return None
            try:
                t = ts[:-1] if ts.endswith("Z") else ts
                dt = datetime.fromisoformat(t)
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                return dt
            except Exception:
                return None

        for entry in data:
            key = (entry["item_id"], entry["location"])
            points = entry.get("data", [])
            filtered = []
            for p in points:
                ts = p.get("timestamp", "")
                dt = _parse_ts(ts)
                if dt is None or dt < cutoff_dt:
                    continue
                filtered.append({
                    "date": ts,
                    "avg_price": p.get("avg_price", 0),
                    "item_count": p.get("item_count", 0),
                })
            # Setřídíme chronologicky (AODP to obvykle už má, ale pro jistotu)
            filtered.sort(key=lambda x: x["date"])
            history[key] = filtered

    return history


def _parse_market_timestamp(ts):
    """Parse AODP timestamp na UTC datetime; None znamená neznámý čas."""
    if not ts:
        return None
    try:
        t = ts[:-1] if ts.endswith("Z") else ts
        dt = datetime.fromisoformat(t)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


def _age_hours(ts):
    """Vrátí stáří market timestampu v hodinách, nebo None."""
    dt = _parse_market_timestamp(ts)
    if dt is None:
        return None
    return max(0.0, (datetime.now(timezone.utc) - dt).total_seconds() / 3600)


def _median_positive(values):
    vals = sorted(v for v in values if v and v > 0)
    if not vals:
        return None
    mid = len(vals) // 2
    if len(vals) % 2 == 0:
        return round((vals[mid - 1] + vals[mid]) / 2)
    return vals[mid]


def apply_risk_adjustment(row, *, focus_budget, min_volume, use_focus):
    """
    Přidá konzervativní profit + confidence skóre.

    Důvod: AODP sell_min je jen aktuální nejnižší listing. Jeden starý nebo
    přestřelený order dokáže vyrobit falešného "championa". Ranking proto
    používá opatrnější cenu a penalizuje stará / tenká / neověřená data.
    """
    flags = []
    confidence = 1.0

    history = row.get("history") or []
    hist_prices = [p.get("avg_price", 0) for p in history]
    hist_median = _median_positive(hist_prices)
    sell_price = row.get("sell_price", 0) or 0
    conservative_sell = sell_price

    if not history:
        flags.append("missing_history")
        confidence -= 0.35
    elif hist_median:
        ratio = sell_price / hist_median if hist_median > 0 else 1.0
        if ratio > 2.0:
            flags.append("sell_price_far_above_history")
            confidence -= 0.40
            conservative_sell = round(hist_median * 1.10)
        elif ratio > 1.35:
            flags.append("sell_price_above_history")
            confidence -= 0.25
            conservative_sell = round(hist_median * 1.15)

    age = _age_hours(row.get("data_age_sell", ""))
    row["sell_price_age_hours"] = round(age, 1) if age is not None else None
    if age is None:
        flags.append("unknown_sell_freshness")
        confidence -= 0.15
    elif age > 24:
        flags.append("stale_sell_price")
        confidence -= 0.25
    elif age > 6:
        flags.append("older_sell_price")
        confidence -= 0.10

    avg_volume = row.get("avg_daily_volume", 0) or 0
    row["daily_volume"] = avg_volume
    if avg_volume <= 0:
        flags.append("no_recent_sales")
        confidence -= 0.30
    elif min_volume > 0 and avg_volume < max(min_volume * 2, min_volume + 5):
        flags.append("thin_volume")
        confidence -= 0.15

    resource_breakdown = row.get("resource_breakdown") or []
    if any((b.get("price_source") or "").startswith("sell_min") for b in resource_breakdown):
        flags.append("resource_price_from_current_listing")
        confidence -= 0.08
    stale_resource = False
    for b in resource_breakdown:
        b_age = _age_hours(b.get("price_updated", ""))
        if b_age is not None and b_age > 24:
            stale_resource = True
            break
    if stale_resource:
        flags.append("stale_resource_price")
        confidence -= 0.12

    if row.get("sell_price_source") == "black_market_buy_max":
        flags.append("black_market_buy_order")
        confidence -= 0.05

    if row.get("sell_city") == "Caerleon":
        flags.append("caerleon_market")
        confidence -= 0.10
    elif row.get("sell_city") == BLACK_MARKET_CITY:
        flags.append("caerleon_black_market")
        confidence -= 0.10

    confidence = max(0.20, min(1.0, confidence))

    net_revenue_conservative = conservative_sell * (1 - MARKET_TAX)
    transport_fee = row.get("transport_fee_per_item", 0) or 0
    setup_fee = (row.get("silver_fee_item", 0) or 0) + (row.get("station_fee_per_item", 0) or 0)
    conservative_profit_focus = (
        net_revenue_conservative
        - (row.get("eff_cost_focus", 0) or 0)
        - setup_fee
        - transport_fee
    )
    conservative_profit_no_focus = (
        net_revenue_conservative
        - (row.get("eff_cost_no_focus", 0) or 0)
        - setup_fee
        - transport_fee
    )

    focus_cost = row.get("focus_cost", 0) or 0
    focus_crafts = focus_budget // focus_cost if use_focus and focus_budget > 0 and focus_cost > 0 else 1
    volume_cap = max(1, int(avg_volume * 0.25)) if avg_volume > 0 else 1
    sellable_crafts = min(focus_crafts, volume_cap) if use_focus else volume_cap

    profit_for_mode = conservative_profit_focus if use_focus else conservative_profit_no_focus
    raw_daily_profit = profit_for_mode * sellable_crafts
    risk_adjusted_daily_profit = raw_daily_profit * confidence

    row["sell_price_conservative"] = round(conservative_sell)
    row["net_revenue_conservative"] = round(net_revenue_conservative)
    row["profit_focus_conservative"] = round(conservative_profit_focus)
    row["profit_no_focus_conservative"] = round(conservative_profit_no_focus)
    row["silver_per_focus_conservative"] = round(conservative_profit_focus / focus_cost, 1) if focus_cost > 0 else 0
    row["sellable_crafts_estimate"] = sellable_crafts
    row["confidence_score"] = round(confidence, 2)
    row["risk_flags"] = flags
    row["risk_label"] = "high" if confidence >= 0.80 else "medium" if confidence >= 0.55 else "low"
    row["raw_daily_profit"] = round(raw_daily_profit)
    row["risk_adjusted_daily_profit"] = round(risk_adjusted_daily_profit)
    return row


# ============================================================
# CRAFTING KALKULACE
# ============================================================

def calculate_craft_cost(resources_needed, prices, location, return_rate,
                          all_cities=None, resource_avg_prices=None,
                          resource_avg_prices_all=None):
    """
    Spočítá efektivní náklad na výrobu 1 kusu s return rate.

    Args:
        all_cities: list všech měst, pro které chceme ukázat ceny surovin
        resource_avg_prices: dict {res_id: avg_price} — 7-day průměr pro craft_city
        resource_avg_prices_all: dict {(res_id, city): avg_price} — 7-day průměr pro všechna města

    Vrací tuple: (effective_cost, nominal_cost, missing, breakdown)
    breakdown obsahuje prices_by_city pro každou surovinu
    """
    nominal_cost = 0
    missing = []
    breakdown = []

    if all_cities is None:
        all_cities = [location]
    if resource_avg_prices is None:
        resource_avg_prices = {}
    if resource_avg_prices_all is None:
        resource_avg_prices_all = {}

    for res_id, qty in resources_needed.items():
        key = (res_id, location)
        if key not in prices or prices[key]["sell_min"] == 0:
            missing.append(res_id)
            continue

        current_sell_min = prices[key]["sell_min"]

        # Pro náklad surovin bereme konzervativnější cenu. Historický průměr je
        # dobrý proti misclickům, ale když trh dnes zdražil, craftit za včerejší
        # cenu nejde. Proto avg7d používáme jen pokud není levnější než aktuální
        # sell_min.
        if res_id in resource_avg_prices:
            avg_price = resource_avg_prices[res_id]
            if current_sell_min > avg_price:
                res_price = current_sell_min
                price_source = "sell_min_above_avg7d"
            else:
                res_price = avg_price
                price_source = "avg7d"
        else:
            res_price = current_sell_min
            price_source = "sell_min"

        subtotal = res_price * qty
        nominal_cost += subtotal

        # Sesbírej ceny ve všech městech pro tuto surovinu
        # Priorita: 7-day vážený průměr > aktuální sell_min
        prices_by_city = []
        for city in all_cities:
            city_key = (res_id, city)
            avg_key = (res_id, city)
            city_sell_min = prices.get(city_key, {}).get("sell_min", 0) or 0
            if avg_key in resource_avg_prices_all:
                avg_price = resource_avg_prices_all[avg_key]
                if city_sell_min > avg_price:
                    city_price = city_sell_min
                    city_source = "sell_min_above_avg7d"
                else:
                    city_price = avg_price
                    city_source = "avg7d"
            elif city_key in prices and prices[city_key]["sell_min"] > 0:
                city_price = prices[city_key]["sell_min"]
                city_source = "sell_min"
            else:
                continue
            prices_by_city.append({
                "city": city,
                "price": city_price,
                "source": city_source,
                "subtotal": city_price * qty,
            })
        prices_by_city.sort(key=lambda p: p["price"])

        breakdown.append({
            "id": res_id,
            "qty": qty,
            "price_per_unit": res_price,
            "price_source": price_source,
            "subtotal": subtotal,
            "price_updated": prices[key].get("sell_updated", ""),
            "prices_by_city": prices_by_city,
        })

    effective_cost = nominal_cost * (1 - return_rate)
    return effective_cost, nominal_cost, missing, breakdown


def calculate_focus_used(resources_needed, tier):
    """
    Focus cost per craft - Albion default je ~12 focus per craft attempt pro T4
    a zvyšuje se s tierem. Zjednodušená aproximace.
    """
    # Base focus cost - realita je komplikovanější, tohle je rough estimate
    base_focus = {4: 12, 5: 24, 6: 48, 7: 96, 8: 192}
    return base_focus.get(tier, 12)


def analyze_item(item, prices, craft_city, sell_cities, has_city_bonus,
                  focus_budget=10000, resource_avg_prices=None,
                  resource_avg_prices_all=None,
                  spec_rr_bonus=0.0, station_fee_rate=0.0,
                  activity_bonus_categories=None):
    """
    Pro jeden item spočítá nejlepší scenario včetně fast travel fee.

    Args:
        focus_budget: denní focus budget (určuje kolik kusů vyrobíš)
        resource_avg_prices: dict {res_id: avg_price} — 7-day průměr pro craft_city
        resource_avg_prices_all: dict {(res_id, city): avg_price} — 7-day průměr pro všechna města
        spec_rr_bonus: bonus k return rate z crafting spec (např. 0.012 pro spec 4)
        station_fee_rate: poplatek stanice jako podíl z nominal cost (např. 0.015 = 1.5%)
        activity_bonus_categories: ručně zadané kategorie z Activities tabu
    """
    rows = []

    has_activity_bonus = activity_bonus_applies_to_item(
        item["category"],
        activity_bonus_categories,
    )
    activity_rr_bonus = ACTIVITY_RETURN_RATE_BONUS if has_activity_bonus else 0.0

    # Return rate podle city bonus + crafting spec + ručně zadaný Activities bonus.
    rr_no_focus = _clamp_return_rate(
        (RR_NO_FOCUS_BONUS if has_city_bonus else RR_NO_FOCUS_BASE)
        + spec_rr_bonus
        + activity_rr_bonus
    )
    rr_focus = _clamp_return_rate(
        (RR_FOCUS_BONUS if has_city_bonus else RR_FOCUS_BASE)
        + spec_rr_bonus
        + activity_rr_bonus
    )

    cost_no_focus, nominal, missing, breakdown = calculate_craft_cost(
        item["resources"], prices, craft_city, rr_no_focus,
        all_cities=sell_cities, resource_avg_prices=resource_avg_prices,
        resource_avg_prices_all=resource_avg_prices_all
    )
    cost_focus, _, _, _ = calculate_craft_cost(
        item["resources"], prices, craft_city, rr_focus,
        resource_avg_prices=resource_avg_prices
    )

    # Station fee = % z nominal cost surovin (poplatek craftovací stanici)
    station_fee_per_item = round(nominal * station_fee_rate)

    if missing:
        return []  # nemáme ceny některých surovin, skip

    # Použij PŘESNÝ focus cost z Gameinfo API (load v build_item_database)
    focus_cost = item.get("focus_cost", 0)
    if focus_cost == 0:
        focus_cost = {4: 12, 5: 24, 6: 48, 7: 96, 8: 192}.get(item["tier"], 12)

    # Setup fee z receptu + station fee (poplatek craftovací stanici)
    setup_fee = item.get("silver_fee", 0) + station_fee_per_item

    # Kolik kusů vyrobíš za focus budget? (Tohle je "velikost dávky")
    batch_size = focus_budget // focus_cost if focus_cost > 0 else 0

    # Pro no-focus mód (focus_budget=0) počítáme transport per-item pro 1 kus,
    # jinak by fee_per_item bylo 0 a profit by byl nadhodnocený.
    transport_batch_size = batch_size if batch_size > 0 else 1

    # Import transport calculator (zjednodušený - jen fast travel)
    from app.core.transport import calculate_transport

    # Zkusíme prodat ve všech městech a vybereme nejlepší
    for sell_city in sell_cities:
        sell_key = (item["item_id"], sell_city)
        is_black_market = sell_city == BLACK_MARKET_CITY
        price_field = "buy_max" if is_black_market else "sell_min"
        updated_field = "buy_updated" if is_black_market else "sell_updated"
        if sell_key not in prices or prices[sell_key][price_field] == 0:
            continue

        sell_price = prices[sell_key][price_field]
        net_revenue = sell_price * (1 - MARKET_TAX)
        transport_sell_city = BLACK_MARKET_TRANSPORT_CITY if is_black_market else sell_city

        # Transport fee pro celou dávku (batch_size kusů, minimálně 1 v no-focus módu)
        transport = calculate_transport(
            craft_city, transport_sell_city, item["category"], item["tier"],
            num_items=transport_batch_size, item_value=sell_price
        )

        # Skip nedostupné cesty
        if not transport["is_feasible"]:
            continue

        # Fee alokovaný per kus
        transport_cost_per_item = transport["fee_per_item"]

        # Profit per kus - MINIMÁLNÍ (jen Normal quality)
        profit_no_focus = net_revenue - cost_no_focus - setup_fee - transport_cost_per_item
        profit_focus = net_revenue - cost_focus - setup_fee - transport_cost_per_item

        # Expected profit s quality bonusem (průměr přes všechny quality stupně)
        # sell_price se násobí quality multiplierem, ale náklady a fee zůstávají stejné
        quality_mult = calculate_expected_quality_multiplier()  # typicky ~1.09
        expected_revenue = net_revenue * quality_mult
        profit_focus_expected = expected_revenue - cost_focus - setup_fee - transport_cost_per_item
        quality_bonus_per_item = profit_focus_expected - profit_focus

        margin_no_focus_pct = (profit_no_focus / cost_no_focus * 100) if cost_no_focus > 0 else 0
        margin_focus_pct = (profit_focus / cost_focus * 100) if cost_focus > 0 else 0

        silver_per_focus = profit_focus / focus_cost if focus_cost > 0 else 0

        # Které město má bonus pro tuto kategorii?
        bonus_city_for_category = next(
            (
                city
                for bonus_map in (CITY_BONUSES, FOOD_CITY_BONUSES)
                for city, cats in bonus_map.items()
                if item["category"] in cats
            ),
            "žádné",
        )

        # Kolik silver ušetříš na surovinách díky bonusu (s focusem)?
        # S bonusem: return rate 62.9% → eff_cost = nominal * (1 - 0.629) = nominal * 0.371
        # Bez bonusu: return rate 47.9% → eff_cost = nominal * (1 - 0.479) = nominal * 0.521
        # Úspora = nominal * (0.521 - 0.371) = nominal * 0.150
        bonus_savings_per_item = round(nominal * (RR_FOCUS_BONUS - RR_FOCUS_BASE))

        rows.append({
            "item_id": item["item_id"],
            "base_item_id": item.get("base_item_id", item["item_id"]),
            "name_en": item.get("name_en", item["item_id"]),
            "name_cs": item.get("name_cs", ""),
            "tier": item["tier"],
            "enchant_level": item.get("enchant_level", 0),
            "category": item["category"],
            "craft_city": craft_city,
            "sell_city": sell_city,
            "city_bonus": "YES" if has_city_bonus else "no",
            "has_activity_bonus": has_activity_bonus,
            "activity_bonus_rr_pct": round(activity_rr_bonus * 100, 1),
            "rr_no_focus_pct": round(rr_no_focus * 100, 1),
            "rr_focus_pct": round(rr_focus * 100, 1),
            "bonus_city": bonus_city_for_category,
            "bonus_savings_per_item": bonus_savings_per_item,
            "nominal_cost": round(nominal),
            "eff_cost_no_focus": round(cost_no_focus),
            "eff_cost_focus": round(cost_focus),
            "sell_price": sell_price,
            "sell_price_source": "black_market_buy_max" if is_black_market else "sell_min",
            "net_revenue": round(net_revenue),
            "profit_no_focus": round(profit_no_focus),
            "profit_focus": round(profit_focus),
            "profit_focus_expected": round(profit_focus_expected),
            "quality_bonus_per_item": round(quality_bonus_per_item),
            "quality_multiplier": round(quality_mult, 3),
            "margin_no_focus_%": round(margin_no_focus_pct, 1),
            "margin_focus_%": round(margin_focus_pct, 1),
            "focus_cost": focus_cost,
            "crafts_with_focus": batch_size,
            "silver_per_focus": round(silver_per_focus, 1),
            "data_age_sell": prices[sell_key][updated_field],
            # Transport info (zjednodušeno - fast travel + Caerleon portál)
            "batch_size": batch_size,
            "transport_method_label": transport["method_label"],
            "transport_sell_city": transport_sell_city,
            "transport_weight_per_item": transport["weight_per_item"],
            "transport_total_weight": transport["total_weight_kg"],
            "transport_total_fee": transport["total_fee"],
            "transport_total_risk": transport["total_risk"],
            "transport_total_cost": transport["total_cost"],
            "transport_fee_per_item": round(transport_cost_per_item),
            "station_fee_per_item": station_fee_per_item,
            "silver_fee_item": item.get("silver_fee", 0),
            "resource_breakdown": breakdown,
            "history": None,
            "avg_daily_volume": 0,
        })

    return rows


# ============================================================
# HLAVNÍ BĚH
# ============================================================

def _ranking_value(row, sort_by, use_focus=True):
    """Řazení musí odpovídat číslu, které UI ukazuje jako hlavní profit."""
    if use_focus and sort_by == "profit_focus":
        return row.get("profit_focus_conservative", row.get("profit_focus", 0))
    if not use_focus and sort_by in ("profit_focus", "silver_per_focus"):
        return row.get("profit_no_focus_conservative", row.get("profit_no_focus", 0))
    if sort_by == "profit_no_focus":
        return row.get("profit_no_focus_conservative", row.get("profit_no_focus", 0))
    if sort_by == "silver_per_focus":
        return row.get("silver_per_focus_conservative", row.get("silver_per_focus", 0))
    return row.get(sort_by, 0)

def run_analysis(city, tiers, top=30, sort_by="silver_per_focus", focus_budget=10000,
                 bonus_only=False, min_volume=10, history_days=7, enchants=None,
                 no_caerleon=False, spec_level=4, station_fee=1.5,
                 out_dir=None, progress_callback=None, mode="equipment",
                 use_focus=True, market_mode=None, history_candidate_limit=None,
                 activity_bonus_categories=None):
    """
    Spustí kompletní analýzu a vrátí (html_string, top_rows).
    Používá ji Streamlit app (app.py).

    mode: "equipment" (default) nebo "food" — určuje, zda se scannují zbroje/zbraně
          nebo meals (jídla). Pro "food" se použijí FOOD_ITEM_KEYS a FOOD_CITY_BONUSES,
          enchanty se ignorují (jídla se neenchantují).
    use_focus: True = standardní focus mód (10 000+ focus/den, vyšší return rate).
               False = "nemám focus dnes" — sort/top se řadí podle profit_no_focus,
               hero a karty zobrazí cost/profit bez focusu (15.2% RR bez bonusu,
               36.2% s bonusem).
    """
    # Když nemáme focus, preferuj řazení podle profit_no_focus
    if not use_focus:
        # Pokud uživatel nezměnil default sort ("silver_per_focus"), přepni na
        # nejlogičtější no-focus metriku. Když si vybral něco specifického, nech to.
        if sort_by == "silver_per_focus":
            sort_by = "profit_no_focus"
        # Pro analýzu nastav focus_budget na 0 aby se sekce "denní focus" zobrazovala
        # neutrálně (nezávisí na tom, kolik focusu má hráč).
        focus_budget = 0
    def log(msg):
        if progress_callback:
            progress_callback(msg)

    if enchants is None:
        enchants = [0]

    # Vyber správný city-bonus slovník podle módu
    if mode == "food":
        active_city_bonuses = FOOD_CITY_BONUSES
        enchants = [0]  # jídla nemají enchanty
    else:
        active_city_bonuses = CITY_BONUSES

    craft_city = city
    # Forge je defaultně local-only kvůli mobilu. Web pilot umí přepnout na
    # Black Market, kde cena není sell_min listing, ale reálný buy_max order.
    if market_mode == "black_market_only":
        sell_cities = [BLACK_MARKET_CITY]
        price_locations = [craft_city, BLACK_MARKET_CITY]
    else:
        sell_cities = [craft_city]
        price_locations = [craft_city]

    spec_rr_bonus = spec_level * RR_SPEC_BONUS_PER_LEVEL
    station_fee_rate = station_fee / 100.0

    # 1. Item DB
    log("Stavím item databázi...")
    from app.core.recipes import RecipeLoader
    recipe_loader = RecipeLoader()
    items = build_item_database(tiers, recipe_loader, enchant_levels=enchants, mode=mode)

    # 2. Posbírej IDs
    all_ids = set()
    resource_ids = set()
    for item in items:
        all_ids.add(item["item_id"])
        all_ids.update(item["resources"].keys())
        resource_ids.update(item["resources"].keys())
    all_ids = sorted(all_ids)
    resource_ids = sorted(resource_ids)

    # 3. Ceny
    log(f"Stahuji ceny ({len(all_ids)} itemů)...")
    prices = fetch_prices(all_ids, price_locations, quality=1)

    # 3a. Outlier filter — vynuluj misclick listings (47M místo 470k atd.)
    outliers = _filter_outlier_sell_prices(prices, threshold=0.80, min_cities=3)
    if outliers:
        log(f"  Vyfiltrováno {len(outliers)} outlier sell_min cen (>80 % od mediánu).")
        # Detail výpis prvních 5 — víc jen zaplaví log, podrobnosti jsou v
        # `outliers` listu pokud někdo bude chtít debug.
        for item_id, city, orig, med in outliers[:5]:
            if not isinstance(med, (int, float)):
                med = 0
            log(f"    {item_id} @ {city}: {orig:,} → 0 (median {med:,})")
        if len(outliers) > 5:
            log(f"    … +{len(outliers) - 5} dalších")

    # 3b. Historie surovin
    log("Stahuji historii cen surovin...")
    resource_history = fetch_history(resource_ids, price_locations, days=history_days, quality=1)
    resource_avg_prices = {}
    resource_avg_prices_all = {}
    for (res_id, c), hist_data in resource_history.items():
        if not hist_data:
            continue
        total_volume = sum(p["item_count"] for p in hist_data)
        if total_volume > 0:
            weighted_avg = round(sum(p["avg_price"] * p["item_count"] for p in hist_data) / total_volume)
            resource_avg_prices_all[(res_id, c)] = weighted_avg
            if c == craft_city:
                resource_avg_prices[res_id] = weighted_avg

    # 4. Počítej marže
    log("Počítám marže...")
    all_rows = []
    for item in items:
        has_bonus = item["category"] in active_city_bonuses.get(craft_city, [])
        if bonus_only and not has_bonus:
            continue
        rows = analyze_item(item, prices, craft_city, sell_cities, has_bonus,
                            focus_budget=focus_budget,
                            resource_avg_prices=resource_avg_prices,
                            resource_avg_prices_all=resource_avg_prices_all,
                            spec_rr_bonus=spec_rr_bonus,
                            station_fee_rate=station_fee_rate,
                            activity_bonus_categories=activity_bonus_categories)
        all_rows.extend(rows)

    if not all_rows:
        raise ValueError("Žádné výsledky — zkus prohlédnout itemy přímo v Albionu.")

    # 5. Historie pro kandidáty. Volume potřebujeme kvůli prodejnosti, ale
    # tahat historii pro celý long-tail je nejdražší část scanu. Proto ji
    # ověřujeme po dávkách seřazených podle profitu a skončíme, jakmile máme
    # dost itemů, které splní volume filtr.
    log("Stahuji cenovou historii kandidátů...")
    sorted_history_rows = sorted(
        all_rows,
        key=lambda r: _ranking_value(r, sort_by, use_focus),
        reverse=True,
    )
    history_batch_size = history_candidate_limit or len(sorted_history_rows)
    desired_volume_matches = (
        min(top, max(10, history_batch_size // 2))
        if min_volume > 0
        else min(top, history_batch_size)
    )
    processed_rows = set()
    checked = 0

    while checked < len(sorted_history_rows):
        batch_rows = sorted_history_rows[checked: checked + history_batch_size]
        checked += len(batch_rows)
        if not batch_rows:
            break

        hist_items = list({r["item_id"] for r in batch_rows})
        hist_cities = list({r["sell_city"] for r in batch_rows})
        log(f"  History batch: {checked}/{len(sorted_history_rows)} kandidátů")
        history = fetch_history(hist_items, hist_cities, days=history_days, quality=1)

        for row in batch_rows:
            processed_rows.add(id(row))
            hist_key = (row["item_id"], row["sell_city"])
            if hist_key in history:
                hist_data = history[hist_key]
                row["history"] = hist_data
                if hist_data:
                    total_count = sum(p["item_count"] for p in hist_data)
                    row["avg_daily_volume"] = round(total_count / len(hist_data))
                    daily_prices = sorted(p["avg_price"] for p in hist_data if p["avg_price"] > 0)
                    if daily_prices:
                        mid = len(daily_prices) // 2
                        if len(daily_prices) % 2 == 0:
                            sell_median = round((daily_prices[mid - 1] + daily_prices[mid]) / 2)
                        else:
                            sell_median = daily_prices[mid]
                        row["sell_price_median"] = sell_median
                        row["sell_price_sell_min"] = row["sell_price"]

            apply_risk_adjustment(
                row,
                focus_budget=focus_budget,
                min_volume=min_volume,
                use_focus=use_focus,
            )

        if min_volume <= 0:
            break

        passing_count = len({
            r["item_id"]
            for r in sorted_history_rows[:checked]
            if r.get("avg_daily_volume", 0) >= min_volume
        })
        if passing_count >= desired_volume_matches:
            break

    for row in all_rows:
        if id(row) in processed_rows:
            continue
        apply_risk_adjustment(
            row,
            focus_budget=focus_budget,
            min_volume=min_volume,
            use_focus=use_focus,
        )

    # 6. Volume filtr
    from collections import defaultdict
    all_rows_by_item = defaultdict(list)
    for r in all_rows:
        all_rows_by_item[r["item_id"]].append(r)

    if min_volume > 0:
        passing_items = {
            item_id
            for item_id, variants in all_rows_by_item.items()
            if any(r.get("avg_daily_volume", 0) >= min_volume for r in variants)
        }
        if not passing_items:
            raise ValueError(f"Žádné itemy nesplnily min volume {min_volume}/den. Zkus snížit min. volume.")
        all_rows_by_item = {k: v for k, v in all_rows_by_item.items() if k in passing_items}

    # 7. Seřadit a vybrat top
    best_variants = []
    for item_id, variants in all_rows_by_item.items():
        if min_volume > 0:
            display_variants = [r for r in variants if r.get("avg_daily_volume", 0) >= min_volume] or variants
        else:
            display_variants = variants
        # Nejlepší město pro item vybíráme už podle opatrného profitu, ne podle
        # raw sell_min. Jinak vyhraje město s jedním podezřelým listingem.
        best_sort_key = "profit_focus_conservative" if use_focus else "profit_no_focus_conservative"
        display_variants.sort(key=lambda r: r[best_sort_key], reverse=True)
        best = display_variants[0]
        best["alternatives"] = display_variants[1:]
        best_variants.append(best)

    top_rows = sorted(
        best_variants,
        key=lambda r: _ranking_value(r, sort_by, use_focus),
        reverse=True,
    )[:top]
    for r in top_rows:
        if use_focus and focus_budget > 0:
            crafts = focus_budget // r["focus_cost"] if r["focus_cost"] > 0 else 0
            r["_daily_profit_raw"] = crafts * r["profit_focus"]
            r["_daily_profit"] = r.get("risk_adjusted_daily_profit", crafts * r["profit_focus_conservative"])
        else:
            # Bez focusu není denní strop focusu — řadíme přímo podle profitu za kus
            r["_daily_profit_raw"] = r["profit_no_focus"]
            r["_daily_profit"] = r.get("risk_adjusted_daily_profit", r["profit_no_focus_conservative"])
    top_rows.sort(key=lambda r: _ranking_value(r, sort_by, use_focus), reverse=True)

    # 8. HTML report
    log("Generuji HTML report...")
    import tempfile, os
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".html", mode="w", encoding="utf-8")
    tmp_path = tmp.name
    tmp.close()
    try:
        html = write_html_report(tmp_path, top_rows, craft_city, tiers, focus_budget, today,
                                 mode=mode, use_focus=use_focus)
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass

    return html, top_rows


def main():
    parser = argparse.ArgumentParser(description="Albion crafting profit analyzer")
    parser.add_argument("--city", default="Bridgewatch",
                        choices=list(CITY_BONUSES.keys()),
                        help="Kde craftíš (default: Bridgewatch)")
    parser.add_argument("--tier", default="4",
                        help="Tiery k analýze, comma-separated (default: 4 — Alex zatím jen T4)")
    parser.add_argument("--top", type=int, default=30,
                        help="Kolik top itemů vypsat v markdown reportu")
    parser.add_argument("--sort-by", default="silver_per_focus",
                        choices=["profit_focus", "profit_no_focus", "margin_focus_%", "silver_per_focus"],
                        help="Podle čeho řadit top výsledky")
    parser.add_argument("--focus-budget", type=int, default=10000,
                        help="Denní focus budget (default: 10000 = premium)")
    parser.add_argument("--bonus-only", action="store_true",
                        help="Ukázat jen itemy s city bonusem (rychlý denní přehled)")
    parser.add_argument("--min-volume", type=int, default=10,
                        help="Min průměrné denní volume za týden (default: 10). 0 = bez filtru.")
    parser.add_argument("--history-days", type=int, default=7,
                        help="Kolik dní historie stahovat pro grafy (default: 7)")
    parser.add_argument("--enchants", default="0",
                        help="Enchant levely k analýze: '0' (base), '0,1' (base+.1), '0,1,2,3' (vše). Default: 0")
    parser.add_argument("--no-caerleon", action="store_true",
                        help="Nedoporučovat prodej v Caerleonu (je tam PvP risk na portálu)")
    parser.add_argument("--spec-level", type=int, default=4,
                        help="Crafting spec level pro T4 nody (default: 4). Každý level +0.3%% return rate.")
    parser.add_argument("--station-fee", type=float, default=1.5,
                        help="Poplatek za craftovací stanici v %% z nominal cost surovin (default: 1.5)")
    parser.add_argument("--out-dir", default=".",
                        help="Kam uložit reporty")
    args = parser.parse_args()

    tiers = [int(t) for t in args.tier.split(",")]
    enchant_levels = [int(e) for e in args.enchants.split(",")]
    craft_city = args.city
    sell_cities = list(CITY_BONUSES.keys())  # prodávat můžeme kdekoliv
    if args.no_caerleon:
        sell_cities = [c for c in sell_cities if c != "Caerleon"]
        print(f"   Caerleon:   SKIP (--no-caerleon)")

    spec_rr_bonus = args.spec_level * RR_SPEC_BONUS_PER_LEVEL
    station_fee_rate = args.station_fee / 100.0

    print(f"\n>> Albion crafting analyzer")
    print(f"   Craft city: {craft_city}")
    print(f"   Tiery:      {tiers}")
    print(f"   Enchanty:   {enchant_levels} ({'base' if enchant_levels == [0] else 'vč. enchantů'})")
    print(f"   Sort by:    {args.sort_by}")
    print(f"   Top N:      {args.top}")
    print(f"   Spec level: {args.spec_level} (+{spec_rr_bonus*100:.1f}% return rate bonus)")
    print(f"   Station fee:{args.station_fee}% z nominal cost surovin")
    print()

    # 1. Postav item DB s PŘESNÝMI recepty z Gameinfo API
    from app.core.recipes import RecipeLoader
    recipe_loader = RecipeLoader()
    items = build_item_database(tiers, recipe_loader, enchant_levels=enchant_levels)
    print(f"[1/5] Postaveno {len(items)} itemů v DB (tiery × enchanty) s přesnými recepty")

    # 2. Posbírej všechna unique item ID (itemy + suroviny)
    all_ids = set()
    resource_ids = set()
    for item in items:
        all_ids.add(item["item_id"])
        all_ids.update(item["resources"].keys())
        resource_ids.update(item["resources"].keys())
    all_ids = sorted(all_ids)
    resource_ids = sorted(resource_ids)
    print(f"[2/5] Stahuji ceny pro {len(all_ids)} unique IDs ze všech měst...")

    # 3. Stáhni ceny
    prices = fetch_prices(all_ids, sell_cities, quality=1)
    print(f"      Získáno {len(prices)} cenových záznamů")

    # 3a. Outlier filter — vynuluj misclick listings (47M místo 470k atd.)
    outliers = _filter_outlier_sell_prices(prices, threshold=0.80, min_cities=3)
    if outliers:
        print(f"      Vyfiltrováno {len(outliers)} outlier sell_min cen (>80 % od mediánu).")
        for item_id, city, orig, med in outliers[:5]:
            print(f"        {item_id} @ {city}: {orig:,} → 0 (median {med:,})")
        if len(outliers) > 5:
            print(f"        … +{len(outliers) - 5} dalších")

    # 3b. Stáhni 7-day historii surovin ve VŠECH městech → vážený průměr ceny
    # (Pro craft_city se průměr používá v kalkulaci profitu.
    #  Pro ostatní města se zobrazuje v breakdown tabulce surovin jako referenční info.)
    print(f"[3b] Stahuji 7-day historii cen surovin ve všech městech ({len(resource_ids)} surovin)...")
    resource_history = fetch_history(resource_ids, sell_cities, days=args.history_days, quality=1)
    # resource_avg_prices: {res_id: avg_price} — jen pro craft_city (pro kalkulaci)
    # resource_avg_prices_all: {(res_id, city): avg_price} — pro všechna města (pro zobrazení)
    resource_avg_prices = {}
    resource_avg_prices_all = {}
    for (res_id, city), hist_data in resource_history.items():
        if not hist_data:
            continue
        total_volume = sum(p["item_count"] for p in hist_data)
        if total_volume > 0:
            weighted_avg = round(sum(p["avg_price"] * p["item_count"] for p in hist_data) / total_volume)
            resource_avg_prices_all[(res_id, city)] = weighted_avg
            if city == craft_city:
                resource_avg_prices[res_id] = weighted_avg
    print(f"      Průměry pro craft city: {len(resource_avg_prices)}/{len(resource_ids)} surovin")
    print(f"      Průměry celkem (všechna města): {len(resource_avg_prices_all)} záznamů")
    no_history = [r for r in resource_ids if r not in resource_avg_prices]
    if no_history:
        print(f"      Fallback na sell_min pro: {', '.join(no_history[:5])}{'...' if len(no_history) > 5 else ''}")

    # 4. Analyzuj
    print(f"[3/5] Počítám marže...")
    all_rows = []
    for item in items:
        has_bonus = item["category"] in CITY_BONUSES.get(craft_city, [])
        rows = analyze_item(item, prices, craft_city, sell_cities, has_bonus,
                             focus_budget=args.focus_budget,
                             resource_avg_prices=resource_avg_prices,
                             resource_avg_prices_all=resource_avg_prices_all,
                             spec_rr_bonus=spec_rr_bonus,
                             station_fee_rate=station_fee_rate)
        all_rows.extend(rows)

    if not all_rows:
        print("\n[!] Žádné výsledky - zkontroluj, že AODP má aktuální data pro tvoje itemy.")
        print("    Často pomůže, když si itemy prohlídneš v Albionu (spustí upload do AODP).")
        return

    print(f"      {len(all_rows)} analyzovaných kombinací")

    # 5. Stáhni historii pro každý (item, sell_city) kombo v top N
    # Abychom nestahovali historii pro všechny kombinace (což by bylo pomalé),
    # stahujeme ji až po prvním sortu - jen pro top 60 kandidátů
    print(f"\n[4/5] Stahuji cenovou historii (posledních {args.history_days} dní) pro top kandidáty...")
    # Předsort pro určení top kandidátů
    pre_sorted = sorted(all_rows, key=lambda r: r[args.sort_by], reverse=True)[:60]

    # Posbírej unique (item, city) páry
    hist_items = list({r["item_id"] for r in pre_sorted})
    hist_cities = list({r["sell_city"] for r in pre_sorted})
    history = fetch_history(hist_items, hist_cities, days=args.history_days, quality=1)
    print(f"      Historie získána pro {len(history)} kombinací")

    # Napojit historii do rows + spočítat avg daily volume + aktualizovat sell_price na medián
    quality_mult = calculate_expected_quality_multiplier()
    for row in all_rows:
        hist_key = (row["item_id"], row["sell_city"])
        if hist_key in history:
            hist_data = history[hist_key]
            row["history"] = hist_data
            if hist_data:
                total_count = sum(p["item_count"] for p in hist_data)
                row["avg_daily_volume"] = round(total_count / len(hist_data))

                # Medián denních cen — jen pro referenční linku v grafu, profit se počítá ze sell_min
                daily_prices = sorted(
                    p["avg_price"] for p in hist_data if p["avg_price"] > 0
                )
                if daily_prices:
                    mid = len(daily_prices) // 2
                    if len(daily_prices) % 2 == 0:
                        sell_median = round((daily_prices[mid - 1] + daily_prices[mid]) / 2)
                    else:
                        sell_median = daily_prices[mid]
                    row["sell_price_median"] = sell_median   # referenční linka v grafu
                    row["sell_price_sell_min"] = row["sell_price"]  # sell_min pro graf (= sell_price)

    # Filter low volume itemy
    # DŮLEŽITÉ: filtr se aplikuje na úrovni ITEMU, ne per (item, město).
    # Item projde filtrem pokud ALESPOŇ JEDNO město splňuje min_volume threshold.
    # V "Kam prodat" tabulce pak ukážeme VŠECHNA města s dostupnou cenou (i ta s nízkým volume).
    from collections import defaultdict
    all_rows_by_item = defaultdict(list)
    for r in all_rows:
        all_rows_by_item[r["item_id"]].append(r)

    if args.min_volume > 0:
        before_item_count = len(all_rows_by_item)
        # Item projde pokud má alespoň jedno město s dostatečným volume
        passing_items = {
            item_id
            for item_id, variants in all_rows_by_item.items()
            if any(
                r["history"] is not None and r["avg_daily_volume"] >= args.min_volume
                for r in variants
            )
        }
        filtered_out = before_item_count - len(passing_items)
        print(f"      Filtr volume ≥ {args.min_volume}/den: odstraněno {filtered_out} itemů, zbývá {len(passing_items)}")

        if not passing_items:
            print(f"\n[!] Žádné itemy nesplnily min volume {args.min_volume}/den.")
            print(f"    Zkus --min-volume 0 pro vypnutí filtru nebo --min-volume 3 pro nižší práh.")
            return

        # Zachováme jen itemy co prošly, ale VŠECHNA jejich města
        all_rows_by_item = {k: v for k, v in all_rows_by_item.items() if k in passing_items}

    # 6. Export
    print(f"\n[5/5] Ukládám reporty...")
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # Flatten pro CSV (jen řádky co mají historii, pro úplnost)
    all_rows_flat = [r for variants in all_rows_by_item.values() for r in variants]

    # CSV - celý dataset (bez strukturovaných polí jako history/breakdown)
    csv_path = out_dir / f"craft_report_{today}.csv"
    csv_skip_fields = {"history", "resource_breakdown", "alternatives"}
    csv_fields = [f for f in all_rows_flat[0].keys() if f not in csv_skip_fields]
    with open(csv_path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=csv_fields, extrasaction="ignore", delimiter=";")
        writer.writeheader()
        writer.writerows(all_rows_flat)
    print(f"      Full CSV:   {csv_path}")

    # Seskupíme podle item_id - jedna karta = jeden item s alternativami
    # (pro každé město kde se dá prodat)

    # Pro každou skupinu vyber nejlepší variant (podle profit_focus).
    # V "Kam prodat" tabulce ukážeme jen města s dostatečným volume (>= min_volume).
    # Tím pádem: item projde filtrem pokud alespoň jedno město splňuje práh,
    # ale tabulka neukáže města s nízkým volume (nezkreslují doporučení).
    best_variants = []
    for item_id, variants in all_rows_by_item.items():
        # Odfiltruj města s nedostatečným volume pro zobrazení
        if args.min_volume > 0:
            display_variants = [
                r for r in variants
                if r.get("avg_daily_volume", 0) >= args.min_volume
            ]
            # Fallback: pokud by žádné město nepřežilo (nemělo by nastat díky
            # item-level filtru výše), ukáž vše
            if not display_variants:
                display_variants = variants
        else:
            display_variants = variants

        display_variants.sort(key=lambda r: r["profit_focus"], reverse=True)
        best = display_variants[0]
        best["alternatives"] = display_variants[1:]  # ostatní města s dostatečným volume
        best_variants.append(best)

    # Seřadíme podle celkového profitu za focus budget
    top_rows = sorted(best_variants, key=lambda r: r[args.sort_by], reverse=True)[:args.top]
    for r in top_rows:
        crafts = args.focus_budget // r["focus_cost"] if r["focus_cost"] > 0 else 0
        r["_daily_profit"] = crafts * r["profit_focus"]
    top_rows.sort(key=lambda r: r["_daily_profit"], reverse=True)

    html_path = out_dir / f"craft_report_{today}.html"
    write_html_report(html_path, top_rows, craft_city, tiers, args.focus_budget, today)
    print(f"      HTML report: {html_path}")
    print(f"\n>> Hotovo. Otevři {html_path.name} v prohlížeči.\n")


def _render_history_charts(history, avg_volume, current_sell_min=0):
    """
    Vygeneruje SVG grafy: volume bar chart + cena area chart (14 dní).
    history = [{date, avg_price, item_count}, ...]
    current_sell_min = aktuální nejnižší sell order (přímý z AODP, pro srovnání s mediánem)
    """
    if not history or len(history) == 0:
        return '<div class="no-history">📉 Žádná cenová historie — nedostatek dat pro tento item</div>'

    dates   = [p["date"][:10] for p in history]
    prices  = [p["avg_price"]  for p in history]
    volumes = [p["item_count"] for p in history]
    n       = len(history)
    days_label = f"Posledních {n} dní"

    W  = 420   # šířka
    H  = 110   # výška grafu
    PL = 52    # left padding (osa Y)
    PR = 12    # right padding
    PT = 14    # top padding
    PB = 26    # bottom padding (datum labely)
    GW = W - PL - PR   # šířka kreslicí plochy
    GH = H - PT - PB   # výška kreslicí plochy

    def fmt_k(v):
        """Formátuj číslo: 12345 → 12.3k"""
        if v >= 1000:
            return f"{v/1000:.1f}k"
        return str(v)

    # ── VOLUME BAR CHART ──────────────────────────────────────────────
    max_vol = max(volumes) if max(volumes) > 0 else 1
    bar_w   = GW / n
    bar_gap = max(1, bar_w * 0.15)

    vol_bars = ""
    vol_tooltips = ""
    for i, (v, d) in enumerate(zip(volumes, dates)):
        bh   = (v / max_vol) * GH
        bx   = PL + i * bar_w + bar_gap / 2
        by   = PT + GH - bh
        bw   = bar_w - bar_gap
        # Barva: dnešní den světlejší
        fill = "#4cbb7a" if i == n - 1 else "#3fa865"
        # Zaoblení jen nahoře
        r    = min(3, bw / 2)
        vol_bars += (
            f'<rect x="{bx:.1f}" y="{by:.1f}" width="{bw:.1f}" height="{bh:.1f}" '
            f'rx="{r}" fill="{fill}" opacity="0.9" '
            f'class="chart-bar" data-tip="{d}: {v:,} ks"/>'
        )

    # Osa Y — 3 horizontální linky
    vol_gridlines = ""
    for frac in [0.5, 1.0]:
        gy = PT + GH - frac * GH
        vol_gridlines += f'<line x1="{PL}" y1="{gy:.1f}" x2="{W-PR}" y2="{gy:.1f}" stroke="#2a3441" stroke-width="1"/>'
        vol_gridlines += f'<text x="{PL-4}" y="{gy+4:.1f}" font-size="9" fill="#5a6472" text-anchor="end">{fmt_k(int(max_vol * frac))}</text>'

    # Datum labely — každý 3. den
    vol_date_labels = ""
    for i, d in enumerate(dates):
        if i == 0 or i == n - 1 or i % max(1, n // 5) == 0:
            lx = PL + (i + 0.5) * bar_w
            vol_date_labels += f'<text x="{lx:.1f}" y="{H-4}" font-size="9" fill="#5a6472" text-anchor="middle">{d[5:]}</text>'

    vol_total = sum(volumes)
    vol_svg = f"""
    <svg viewBox="0 0 {W} {H}" width="100%" xmlns="http://www.w3.org/2000/svg" style="overflow:visible">
      <text x="{PL}" y="10" font-size="10" fill="#8a9199">celkem {vol_total:,} ks · průměr {avg_volume}/den</text>
      {vol_gridlines}
      {vol_bars}
      {vol_date_labels}
    </svg>"""

    # ── Sdílená pomocná funkce pro oba price grafy ────────────────────
    def make_price_svg(grad_suffix, line_color, line_opacity,
                       ref_line=None, ref_color=None, ref_label=None,
                       header_extra="", show_sell_min=False, h_override=None):
        H2 = h_override if h_override else H
        GH2 = H2 - PT - PB
        valid2 = [(i, p) for i, p in enumerate(prices) if p > 0]
        if not valid2:
            return '<div class="no-chart">Nedostatek cenových dat</div>'
        min_p2 = min(p for _, p in valid2)
        max_p2 = max(p for _, p in valid2)
        pad_p2 = max((max_p2 - min_p2) * 0.1, max_p2 * 0.02)
        lo2 = max(0, min_p2 - pad_p2)
        hi2 = max_p2 + pad_p2
        if ref_line is not None:
            lo2 = min(lo2, ref_line * 0.97)
            hi2 = max(hi2, ref_line * 1.03)
        if show_sell_min and current_sell_min > 0:
            lo2 = min(lo2, current_sell_min * 0.97)
            hi2 = max(hi2, current_sell_min * 1.03)
        rng2 = max(hi2 - lo2, 1)

        def px2(i):
            return PL + (i / max(n - 1, 1)) * GW
        def py2(p):
            return PT + GH2 - ((p - lo2) / rng2) * GH2

        coords2 = [(px2(i), py2(p)) for i, p in valid2]
        line_pts2 = " ".join(f"{x:.1f},{y:.1f}" for x, y in coords2)
        area_pts2 = (f"{coords2[0][0]:.1f},{PT+GH2:.1f} " + line_pts2
                     + f" {coords2[-1][0]:.1f},{PT+GH2:.1f}")
        gid = f"pg{grad_suffix}"
        grad2 = (f'<defs><linearGradient id="{gid}" x1="0" y1="0" x2="0" y2="1">'
                 f'<stop offset="0%" stop-color="{line_color}" stop-opacity="0.30"/>'
                 f'<stop offset="100%" stop-color="{line_color}" stop-opacity="0.03"/>'
                 f'</linearGradient></defs>')
        area2 = f'<polygon points="{area_pts2}" fill="url(#{gid})"/>'
        poly2 = (f'<polyline points="{line_pts2}" fill="none" stroke="{line_color}"'
                 f' stroke-width="2" stroke-linejoin="round" opacity="{line_opacity}"/>')
        dots2 = ""
        for (ix, iy), (i, p) in zip(coords2, valid2):
            dots2 += (f'<circle cx="{ix:.1f}" cy="{iy:.1f}" r="3.5" fill="{line_color}"'
                      f' stroke="#0f1419" stroke-width="1.5"'
                      f' class="chart-dot" data-tip="{dates[i]}: {p:,} silver"/>')
        ref_svg = ""
        if ref_line is not None and ref_color:
            ry = py2(ref_line)
            ref_svg = (f'<line x1="{PL}" y1="{ry:.1f}" x2="{W-PR}" y2="{ry:.1f}"'
                       f' stroke="{ref_color}" stroke-width="1.5" stroke-dasharray="5,3" opacity="0.9"/>'
                       f'<text x="{PL-4}" y="{ry+4:.1f}" font-size="9" fill="{ref_color}"'
                       f' text-anchor="end" font-weight="bold">{fmt_k(int(ref_line))}</text>'
                       f'<text x="{W-PR}" y="{ry-3:.1f}" font-size="8" fill="{ref_color}"'
                       f' text-anchor="end">{ref_label or ""}</text>')
        sm_svg = ""
        if show_sell_min and current_sell_min > 0:
            smy = py2(current_sell_min)
            sm_svg = (f'<line x1="{PL}" y1="{smy:.1f}" x2="{W-PR}" y2="{smy:.1f}"'
                      f' stroke="#30d0c8" stroke-width="1.5" stroke-dasharray="3,4" opacity="0.85"/>'
                      f'<text x="{PL-4}" y="{smy+4:.1f}" font-size="9" fill="#30d0c8"'
                      f' text-anchor="end" font-weight="bold">{fmt_k(int(current_sell_min))}</text>'
                      f'<text x="{W-PR}" y="{smy-3:.1f}" font-size="8" fill="#30d0c8"'
                      f' text-anchor="end">min</text>')
        gridlines2 = ""
        for frac, val in [(0, lo2), (0.5, (lo2 + hi2) / 2), (1.0, hi2)]:
            gy = PT + GH2 - frac * GH2
            gridlines2 += (f'<line x1="{PL}" y1="{gy:.1f}" x2="{W-PR}" y2="{gy:.1f}"'
                           f' stroke="#2a3441" stroke-width="1"/>'
                           f'<text x="{PL-4}" y="{gy+4:.1f}" font-size="9"'
                           f' fill="#5a6472" text-anchor="end">{fmt_k(int(val))}</text>')
        date_labels2 = ""
        for i, d in enumerate(dates):
            if i == 0 or i == n - 1 or i % max(1, n // 5) == 0:
                lx = px2(i)
                date_labels2 += (f'<text x="{lx:.1f}" y="{H2-4}" font-size="9"'
                                 f' fill="#5a6472" text-anchor="middle">{d[5:]}</text>')
        # viewBox používá H2 (ne H) aby se obsah grafu s h_override nepřetékal
        # přes okraje do sousedních karet/grafů.
        return (f'<svg viewBox="0 0 {W} {H2}" width="100%" preserveAspectRatio="xMidYMid meet"'
                f' xmlns="http://www.w3.org/2000/svg" style="overflow:hidden;display:block">'
                f'{grad2}'
                f'<text x="{PL}" y="10" font-size="10" fill="#8a9199">{header_extra}</text>'
                f'{gridlines2}{area2}{poly2}{ref_svg}{sm_svg}{dots2}{date_labels2}'
                f'</svg>')

    # ── Cenový graf (s referencí na aktuální sell_min) ────────────────
    valid_all = [(i, p) for i, p in enumerate(prices) if p > 0]
    if valid_all:
        sorted_p = sorted(p for _, p in valid_all)
        min_p = min(sorted_p)
        max_p = max(sorted_p)
        sm_hdr = f"min {fmt_k(int(current_sell_min))} · " if current_sell_min > 0 else ""
        price_svg = make_price_svg(
            "A", "#4a90e2", "1",
            ref_line=current_sell_min if current_sell_min > 0 else None,
            ref_color="#30d0c8", ref_label="min",
            header_extra=f"{sm_hdr}hist {fmt_k(min_p)}–{fmt_k(max_p)}"
        )
    else:
        price_svg = '<div class="no-chart">Nedostatek cenových dat</div>'

    return f"""
        <div class="charts-section">
            <div class="section-label">📈 {days_label}</div>
            <div class="charts-grid charts-grid-2">
                <div class="chart-box">
                    <div class="chart-title">📦 Volume (ks/den)</div>
                    {vol_svg}
                </div>
                <div class="chart-box">
                    <div class="chart-title">💰 Cena — aktuální sell_min</div>
                    {price_svg}
                </div>
            </div>
        </div>
    """



# Lidsky čitelné názvy kategorií pro referenční tabulku
CATEGORY_LABELS = {
    "PLATE_HELMET":   ("Plate Helmet",   "🪖"),
    "PLATE_ARMOR":    ("Plate Armor",    "🛡️"),
    "PLATE_SHOES":    ("Plate Boots",    "👢"),
    "LEATHER_HELMET": ("Leather Helmet", "🪖"),
    "LEATHER_ARMOR":  ("Leather Armor",  "🦺"),
    "LEATHER_SHOES":  ("Leather Shoes",  "👟"),
    "CLOTH_HELMET":   ("Cloth Cowl",     "🪖"),
    "CLOTH_ARMOR":    ("Cloth Robe",     "👘"),
    "CLOTH_SANDALS":  ("Cloth Sandals",  "🩴"),
    "SWORD":          ("Sword",          "⚔️"),
    "AXE":            ("Axe",            "🪓"),
    "HAMMER":         ("Hammer",         "🔨"),
    "DAGGER":         ("Dagger",         "🗡️"),
    "QUARTERSTAFF":   ("Quarterstaff",   "🪄"),
    "BOW":            ("Bow",            "🏹"),
    "CROSSBOW":       ("Crossbow",       "🏹"),
    "FIRE_STAFF":     ("Fire Staff",     "🔥"),
    "CURSED_STAFF":   ("Cursed Staff",   "💀"),
    "ARCANE_STAFF":   ("Arcane Staff",   "✨"),
    "OFFHAND":        ("Offhand",        "🛡️"),
    "SHIELD":         ("Shield",         "🛡️"),
    "TORCH":          ("Torch",          "🔦"),
    "HORN":           ("Horn",           "📯"),
    "BOOK":           ("Book",           "📖"),
    "ORB":            ("Orb",            "🔮"),
}

# Skupiny kategorií pro přehledné zobrazení
CATEGORY_GROUPS = [
    ("Plate", ["PLATE_HELMET", "PLATE_ARMOR", "PLATE_SHOES"]),
    ("Leather", ["LEATHER_HELMET", "LEATHER_ARMOR", "LEATHER_SHOES"]),
    ("Cloth", ["CLOTH_HELMET", "CLOTH_ARMOR", "CLOTH_SANDALS"]),
    ("Swords & Axes", ["SWORD", "AXE", "DAGGER", "HAMMER"]),
    ("Ranged", ["BOW", "CROSSBOW", "QUARTERSTAFF"]),
    ("Staves", ["FIRE_STAFF", "CURSED_STAFF", "ARCANE_STAFF"]),
    ("Offhand", ["OFFHAND", "SHIELD", "TORCH", "HORN", "BOOK", "ORB"]),
]

def _build_city_bonus_table():
    """Vygeneruje HTML tabulku city bonusů — řádky = kategorie, sloupce = města. Neutrální, bez zvýrazňování."""
    cities = ["Bridgewatch", "Lymhurst", "Thetford", "Fort Sterling", "Martlock", "Caerleon"]

    # Inverzní mapa: category → město s bonusem
    category_to_city = {}
    for city, cats in CITY_BONUSES.items():
        for cat in cats:
            category_to_city[cat] = city

    city_headers = ""
    for city in cities:
        city_headers += f'<th class="bonus-city-header">{city}</th>'

    rows_html = ""
    for group_name, categories in CATEGORY_GROUPS:
        rows_html += f'<tr class="bonus-group-row"><td colspan="{len(cities) + 1}" class="bonus-group-label">{group_name}</td></tr>\n'
        for cat in categories:
            label, icon = CATEGORY_LABELS.get(cat, (cat, ""))
            bonus_city = category_to_city.get(cat, None)

            cells = f'<td class="bonus-item-name">{icon} {label}</td>'
            for city in cities:
                has_bonus = bonus_city == city
                if has_bonus:
                    cells += f'<td class="bonus-cell-yes">⭐ {city}</td>'
                elif city == "Caerleon":
                    cells += '<td class="bonus-cell-caerleon">—</td>'
                else:
                    cells += '<td class="bonus-cell-no"></td>'
            rows_html += f"<tr>{cells}</tr>\n"

    return f"""
    <div class="bonus-table-section">
        <h2>🗺️ City Bonus Reference</h2>
        <p class="bonus-note">⭐ = bonus v daném městě = nižší náklady na suroviny díky vyššímu return rate.<br>
        S focusem: <b>62.9%</b> return rate (bonus) vs. <b>47.9%</b> (bez bonusu) — rozdíl ~15% z nominální ceny surovin.<br>
        Bez focusu: <b>36.2%</b> (bonus) vs. <b>15.2%</b> (bez bonusu).</p>
        <div class="bonus-table-wrap">
        <table class="bonus-table">
            <thead>
                <tr>
                    <th class="bonus-item-header">Item kategorie</th>
                    {city_headers}
                </tr>
            </thead>
            <tbody>
                {rows_html}
            </tbody>
        </table>
        </div>
    </div>
    """



def write_html_report(*args, **kwargs):
    """STUB - HTML report byl odstrizen pri migraci na FastAPI / mobile FE.

    Backend vraci JSON a mobile FE si UI vykresluje sam.
    Tohle je no-op aby code path v run_analysis probehl bez vyjimky.
    """
    return None
