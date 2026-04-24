"""
Recipe Loader — Oficiální recepty z Gameinfo API
================================================

Stahuje PŘESNÉ recepty přímo ze hry:
- Přesné suroviny a počty (i mix T-1 + T surovin!)
- Přesný focus cost
- Přesný silver fee

Zdroj: https://gameinfo.albiononline.com/api/gameinfo/items/{ID}/data
(Oficiální API od Sandbox Interactive, publikované pro killboard a render)

Strategie:
- Cacheuje recepty lokálně (recipes_cache.json) - API se volá jen pro nové itemy
- Fallback: ao-bin-dumps GitHub repo pokud API selže
- Detekuje "potion/meal bug" (food/potions mají neúplný recept v API, používá se fallback)
"""

import json
import time
from pathlib import Path
from typing import Dict, List, Optional

import requests

# Oficiální Gameinfo API od Sandbox Interactive
GAMEINFO_API = "https://gameinfo.albiononline.com/api/gameinfo/items"

# Fallback: community repo s dumpem bin souborů ze hry
# Více fallback URL pro bulk dump. github.com/raw redirectuje na
# raw.githubusercontent.com, ale někdy jedna cesta selže a druhá projde.
# jsdelivr je CDN proxy nad GitHubem - rychlejší a spolehlivější.
# items.json v ROOT má crafting data (craftingrequirements),
# formatted/items.json má jen lokalizaci (LocalizedNames). Pozor na rozdíl!
AO_BIN_DUMPS_URLS = [
    "https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master/items.json",
    "https://github.com/ao-data/ao-bin-dumps/raw/master/items.json",
    "https://cdn.jsdelivr.net/gh/ao-data/ao-bin-dumps@master/items.json",
]
AO_BIN_DUMPS_JSON = AO_BIN_DUMPS_URLS[0]  # pro zpětnou kompatibilitu

# Statický dump item names (ID -> "Adept's Soldier Armor" atd.)
# Format: "  123: T4_ARMOR_PLATE_SET1       : Adept's Soldier Armor"
# Zkoušíme více zdrojů (primarní + CDN fallback)
ITEMS_NAMES_SOURCES = [
    "https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master/formatted/items.txt",
    "https://cdn.jsdelivr.net/gh/ao-data/ao-bin-dumps@master/formatted/items.txt",
    "https://raw.githubusercontent.com/broderickhyman/ao-bin-dumps/master/formatted/items.txt",
    "https://cdn.jsdelivr.net/gh/broderickhyman/ao-bin-dumps@master/formatted/items.txt",
]

CACHE_FILE = "recipes_cache.json"
NAMES_CACHE_FILE = "item_names_cache.json"


class ItemNameLoader:
    """
    Načítá čitelné názvy itemů z ao-bin-dumps repo.
    Stahuje items.txt jednou, cacheuje lokálně.
    """

    def __init__(self, cache_path: str = NAMES_CACHE_FILE):
        self.cache_path = Path(cache_path)
        self.names: Dict[str, str] = {}
        self._load_or_fetch()

    def _load_or_fetch(self):
        if self.cache_path.exists():
            try:
                with open(self.cache_path, "r", encoding="utf-8") as f:
                    self.names = json.load(f)
                    if self.names:
                        return
            except (json.JSONDecodeError, OSError):
                pass

        # Stáhni items.txt a naparsuj (zkouší více zdrojů)
        print(f"[names] Stahuji items.txt (první spuštění, ~500 KB)...")
        for source_url in ITEMS_NAMES_SOURCES:
            try:
                resp = requests.get(source_url, timeout=30)
                resp.raise_for_status()
                self.names = self._parse_items_txt(resp.text)
                if self.names:
                    # Uložit cache
                    try:
                        with open(self.cache_path, "w", encoding="utf-8") as f:
                            json.dump(self.names, f, ensure_ascii=False, indent=2)
                        print(f"[names] Načteno {len(self.names)} názvů itemů ze {source_url.split('/')[2]}")
                    except OSError as e:
                        print(f"[names] Nelze uložit cache: {e}")
                    return
            except requests.RequestException as e:
                print(f"[names] Zdroj {source_url.split('/')[2]} selhal: {e}")
                continue

        print(f"[names] VAROVÁNÍ: Žádný zdroj s názvy itemů není dostupný")
        print(f"[names] Zkontroluj internet. Itemy budou mít technické názvy místo čitelných.")
        self.names = {}

    @staticmethod
    def _parse_items_txt(text: str) -> Dict[str, str]:
        """
        Parse items.txt řádky:
        "  123: T4_ARMOR_PLATE_SET1                : Adept's Soldier Armor"
        → {"T4_ARMOR_PLATE_SET1": "Adept's Soldier Armor"}
        """
        result = {}
        for line in text.splitlines():
            # Format: "INDEX: ITEM_ID : NAME"
            # Rozdělíme na 3 části po ": "
            parts = line.split(":", 2)
            if len(parts) < 3:
                continue
            item_id = parts[1].strip()
            name = parts[2].strip()
            if item_id and name and not item_id.startswith("#"):
                result[item_id] = name
        return result

    def get_name(self, item_id: str) -> str:
        """
        Vrátí čitelný název itemu. Odstraní enchant suffix (@1/@2/@3)
        před lookupem, protože items.txt má jen base tier.
        Pro enchanted itemy vrátí název + příznak enchantu.
        """
        if not item_id:
            return ""

        # Odstraň @1/@2/@3 suffix
        base_id = item_id.split("@")[0]
        base_name = self.names.get(base_id, "")

        return base_name


class RecipeLoader:
    def __init__(self, cache_path: str = CACHE_FILE):
        self.cache_path = Path(cache_path)
        self.cache = self._load_cache()
        self.bulk_data = None  # lazy-loaded full dump jako fallback

    def _load_cache(self) -> Dict[str, Dict]:
        if self.cache_path.exists():
            try:
                with open(self.cache_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except (json.JSONDecodeError, OSError):
                print(f"[recipes] Cache poškozený, začínám znovu")
        return {}

    def _save_cache(self):
        try:
            with open(self.cache_path, "w", encoding="utf-8") as f:
                json.dump(self.cache, f, ensure_ascii=False, indent=2)
        except OSError as e:
            print(f"[recipes] Nelze uložit cache: {e}")

    def _fetch_from_gameinfo(self, item_id: str) -> Optional[Dict]:
        """Primární zdroj: Gameinfo API."""
        url = f"{GAMEINFO_API}/{item_id}/data"
        try:
            resp = requests.get(url, timeout=15)
            resp.raise_for_status()
            data = resp.json()
        except (requests.RequestException, json.JSONDecodeError):
            return None

        craft_req = data.get("craftingRequirements")
        if not craft_req:
            return None

        # Může být dict nebo list (u zbraní s více variantami)
        if isinstance(craft_req, list):
            craft_req = craft_req[0] if craft_req else None
            if not craft_req:
                return None

        resources = [
            {"id": res["uniqueName"], "count": res["count"]}
            for res in craft_req.get("craftResourceList", [])
        ]

        if not resources:
            return None

        # Gameinfo API vrací localizedNames s jazyky - vezmeme anglický
        # Format: {"EN-US": "Adept's Soldier Armor", "DE-DE": "...", ...}
        localized = data.get("localizedNames") or {}
        name_en = localized.get("EN-US") or localized.get("en-US") or item_id
        name_cs = localized.get("CS-CZ") or localized.get("cs-CZ") or ""

        return {
            "item_id": item_id,
            "name_en": name_en,
            "name_cs": name_cs,
            "focus_cost": craft_req.get("craftingFocus", 0),
            "silver_fee": craft_req.get("silver", 0),
            "time_seconds": craft_req.get("time", 0),
            "resources": resources,
            "source": "gameinfo_api",
        }

    def _ensure_bulk_data(self):
        """Lazy load plného dumpu z ao-bin-dumps (fallback)."""
        if self.bulk_data is not None:
            return

        self.bulk_data_error = None  # detail pro diagnostiku
        raw = None
        errors = []
        for url in AO_BIN_DUMPS_URLS:
            print(f"[recipes] Stahuji bulk dump z: {url}")
            try:
                resp = requests.get(url, timeout=120, headers={"User-Agent": "albion-crafting/1.0"})
                resp.raise_for_status()
                raw = resp.json()
                print(f"[recipes] OK, dostal jsem {len(resp.content)/1024/1024:.1f} MB z {url}")
                break
            except Exception as e:
                errors.append(f"{url}: {type(e).__name__}: {e}")
                print(f"[recipes] Selhalo: {e}")
                continue
        if raw is None:
            self.bulk_data = {}
            self.bulk_data_error = " | ".join(errors)
            print(f"[recipes] Všechny URL selhaly: {self.bulk_data_error}")
            return

        try:

            # Transformace do našeho formátu - podporujeme 3 možné struktury ao-bin-dumps:
            # 1) {"items": {"equipmentitem": [...], "consumableitem": [...]}} (starý formát)
            # 2) {"equipmentitem": [...], "consumableitem": [...]} (bez wrapperu "items")
            # 3) [item1, item2, ...] (flat list, nový formát)
            self.bulk_data = {}
            items_list = []

            def _extract_items_from_category(cat_items):
                """Z kategorie (list nebo single dict) vytáhne seznam item dictů."""
                out = []
                if isinstance(cat_items, dict):
                    if cat_items.get("@uniquename"):
                        out.append(cat_items)
                elif isinstance(cat_items, list):
                    for it in cat_items:
                        if isinstance(it, dict) and it.get("@uniquename"):
                            out.append(it)
                return out

            if isinstance(raw, list):
                # Flat list formát — každý prvek je item
                for it in raw:
                    if isinstance(it, dict) and it.get("@uniquename"):
                        items_list.append(it)
                print(f"[recipes] Flat list struktura: {len(items_list)} itemů")
            elif isinstance(raw, dict):
                # Zkus nejdřív "items" wrapper
                items_raw = raw.get("items")
                if items_raw is None:
                    # Formát bez wrapperu — top-level klíče jsou přímo kategorie
                    items_raw = raw
                if isinstance(items_raw, dict):
                    for cat_name, cat_items in items_raw.items():
                        items_list.extend(_extract_items_from_category(cat_items))
                    print(f"[recipes] Dict struktura: {len(items_list)} itemů z {len(items_raw)} kategorií")
                elif isinstance(items_raw, list):
                    for it in items_raw:
                        if isinstance(it, dict) and it.get("@uniquename"):
                            items_list.append(it)
                    print(f"[recipes] Dict s list items: {len(items_list)} itemů")
            else:
                raise ValueError(f"Neznámá top-level struktura: {type(raw).__name__}")

            for item in items_list:
                uid = item.get("@uniquename", "")
                if not uid:
                    continue
                craft = item.get("craftingrequirements")
                if isinstance(craft, list):
                    craft = craft[0] if craft else None
                if not craft:
                    continue

                resources = []
                res_list = craft.get("craftresource", [])
                if isinstance(res_list, dict):
                    res_list = [res_list]

                for res in res_list:
                    resources.append({
                        "id": res.get("@uniquename", ""),
                        "count": int(res.get("@count", 0)),
                    })

                if resources:
                    self.bulk_data[uid] = {
                        "item_id": uid,
                        "focus_cost": int(craft.get("@craftingfocus", 0)),
                        "silver_fee": int(craft.get("@silver", 0)),
                        "time_seconds": float(craft.get("@time", 0)),
                        "resources": resources,
                        "source": "ao_bin_dumps",
                    }

            print(f"[recipes] Fallback dump načten: {len(self.bulk_data)} receptů")
        except Exception as e:
            import traceback
            tb = traceback.format_exc()
            print(f"[recipes] Fallback dump selhal při parsingu: {e}\n{tb}")
            self.bulk_data = {}
            self.bulk_data_error = f"Parsing selhal: {type(e).__name__}: {e}\n\nTraceback:\n{tb}"

    def get_recipe(self, item_id: str, force_refresh: bool = False) -> Optional[Dict]:
        """
        Vrátí recept pro item. Zkusí cache → Gameinfo API → bulk dump.
        Pro jídla (MEAL_*) Gameinfo API vrací neúplná data (known meal bug),
        takže pro ně jdeme rovnou na bulk dump.
        """
        if not force_refresh and item_id in self.cache:
            return self.cache[item_id]

        is_meal = "_MEAL_" in item_id or item_id.startswith(("T1_MEAL", "T2_MEAL", "T3_MEAL",
                                                              "T4_MEAL", "T5_MEAL", "T6_MEAL",
                                                              "T7_MEAL", "T8_MEAL"))

        recipe = None
        if not is_meal:
            # 1. Gameinfo API (jen pro equipment — meals tam mají bug)
            recipe = self._fetch_from_gameinfo(item_id)

        # 2. Fallback / primární zdroj pro meals: bulk dump
        if recipe is None:
            self._ensure_bulk_data()
            if self.bulk_data and item_id in self.bulk_data:
                recipe = self.bulk_data[item_id]

        # Cache i negativní výsledek
        self.cache[item_id] = recipe
        return recipe

    def get_meal_ids_for_tiers(self, tiers: List[int]) -> List[str]:
        """
        Vrátí VŠECHNY meal item IDs z bulk dumpu, které odpovídají daným tierům.
        Tím se vyhneme hádání suffixů (FOOD_TIER_VARIANTS) a spolehneme se na
        reálný seznam itemů ze hry.
        """
        self._ensure_bulk_data()
        if not self.bulk_data:
            print("[recipes] get_meal_ids_for_tiers: bulk_data empty → vracím []")
            return []
        tier_prefixes = tuple(f"T{t}_MEAL_" for t in tiers)
        meal_ids = [iid for iid in self.bulk_data.keys() if iid.startswith(tier_prefixes)]
        print(f"[recipes] Nalezeno {len(meal_ids)} meal IDs v bulk dumpu pro tiery {tiers}")
        # Uložíme recepty do cache rovnou (bulk_data už recept obsahuje)
        for iid in meal_ids:
            if iid not in self.cache:
                self.cache[iid] = self.bulk_data[iid]
        return meal_ids

    def preload_recipes(self, item_ids: List[str], rate_limit_s: float = 0.15) -> Dict[str, Dict]:
        """Batch stažení. Respektuje rate limit pro Gameinfo API volání."""
        to_fetch = [iid for iid in item_ids if iid not in self.cache]

        if to_fetch:
            print(f"[recipes] Stahuji {len(to_fetch)} nových receptů...")
            failed = 0
            for i, iid in enumerate(to_fetch, 1):
                # Meals jdou rovnou na bulk dump (žádný Gameinfo API call),
                # takže sleep není potřeba. Zrychluje to food mode 10×.
                is_meal = "_MEAL_" in iid
                result = self.get_recipe(iid)
                if result is None:
                    failed += 1
                if i % 50 == 0:
                    print(f"  [{i}/{len(to_fetch)}] ({failed} neznámých)")
                if not is_meal:
                    time.sleep(rate_limit_s)
            self._save_cache()
            print(f"[recipes] Cache uložen ({len(self.cache)} receptů celkem, {failed} neznámých)")
        else:
            print(f"[recipes] Všechny recepty v cache ({len(item_ids)} itemů)")

        return {iid: self.cache.get(iid) for iid in item_ids}


if __name__ == "__main__":
    # Demo
    loader = RecipeLoader()
    test_items = [
        "T4_ARMOR_PLATE_SET1",
        "T4_HEAD_PLATE_SET1",
        "T4_MAIN_HAMMER",
        "T5_2H_CROSSBOW",
    ]
    recipes = loader.preload_recipes(test_items)

    print("\n" + "=" * 60)
    print("VÝSLEDEK:")
    print("=" * 60)
    for iid, r in recipes.items():
        if r is None:
            print(f"\n{iid}: ⚠️ RECEPT NENALEZEN (neznámý item ID?)")
            continue
        print(f"\n{iid}:  [{r['source']}]")
        print(f"  Focus: {r['focus_cost']} | Silver fee: {r['silver_fee']} | Čas: {r['time_seconds']}s")
        print(f"  Suroviny:")
        for res in r["resources"]:
            print(f"    - {res['count']}× {res['id']}")
