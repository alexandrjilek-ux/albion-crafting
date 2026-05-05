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
import os
import re
import tempfile
import time
from pathlib import Path
from typing import Dict, List, Optional

import requests

# Oficiální Gameinfo API od Sandbox Interactive
GAMEINFO_API = "https://gameinfo.albiononline.com/api/gameinfo/items"

# Fallback: community repo s dumpem bin souborů ze hry.
# POZOR: `formatted/items.json` je jen i18n dump (LocalizedNames, UniqueName) — nemá recepty!
# Ten skutečný file s craftingrequirements je na ROOT úrovni repo (`items.json`),
# odvozený z items.xml (~50 MB).
AO_BIN_DUMPS_JSON = "https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master/items.json"

ITEMS_NAMES_SOURCES = [
    "https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master/formatted/items.txt",
    "https://cdn.jsdelivr.net/gh/ao-data/ao-bin-dumps@master/formatted/items.txt",
    "https://raw.githubusercontent.com/broderickhyman/ao-bin-dumps/master/formatted/items.txt",
    "https://cdn.jsdelivr.net/gh/broderickhyman/ao-bin-dumps@master/formatted/items.txt",
]

_DATA_DIR = Path(__file__).resolve().parent / "data"
CACHE_FILE = str(_DATA_DIR / "recipes_cache.json")
NAMES_CACHE_FILE = str(_DATA_DIR / "item_names_cache.json")
BULK_DUMP_CACHE_FILE = str(_DATA_DIR / "bulk_recipes_cache.json")


class ItemNameLoader:
    """Načítá čitelné názvy itemů z ao-bin-dumps repo."""

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

        print(f"[names] Stahuji items.txt (prvni spusteni, ~500 KB)...")
        for source_url in ITEMS_NAMES_SOURCES:
            try:
                resp = requests.get(source_url, timeout=30)
                resp.raise_for_status()
                self.names = self._parse_items_txt(resp.text)
                if self.names:
                    try:
                        with open(self.cache_path, "w", encoding="utf-8") as f:
                            json.dump(self.names, f, ensure_ascii=False, indent=2)
                        print(f"[names] Nacteno {len(self.names)} nazvu itemu ze {source_url.split('/')[2]}")
                    except OSError as e:
                        print(f"[names] Nelze ulozit cache: {e}")
                    return
            except requests.RequestException as e:
                print(f"[names] Zdroj {source_url.split('/')[2]} selhal: {e}")
                continue

        print(f"[names] VAROVANI: Zadny zdroj s nazvy itemu neni dostupny")
        self.names = {}

    @staticmethod
    def _parse_items_txt(text: str) -> Dict[str, str]:
        result = {}
        for line in text.splitlines():
            parts = line.split(":", 2)
            if len(parts) < 3:
                continue
            item_id = parts[1].strip()
            name = parts[2].strip()
            if item_id and name and not item_id.startswith("#"):
                result[item_id] = name
        return result

    def get_name(self, item_id: str) -> str:
        if not item_id:
            return ""
        base_id = item_id.split("@")[0]
        return self.names.get(base_id, "")


class RecipeLoader:
    def __init__(self, cache_path: str = CACHE_FILE):
        self.cache_path = Path(cache_path)
        self.cache = self._load_cache()
        self.bulk_data = None
        self._meal_ids_cache: Optional[Dict[int, List[str]]] = None

    def _load_cache(self) -> Dict[str, Dict]:
        if self.cache_path.exists():
            try:
                with open(self.cache_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except (json.JSONDecodeError, OSError):
                print(f"[recipes] Cache poskozeny, zacinam znovu")
        return {}

    def _save_cache(self):
        # Atomic write: dump do .tmp ve stejnem adresari, pak `os.replace`
        # prejmenuje za jeden filesystem syscall. Predtim se cache rozbila
        # (truncated mid-string) a loader to defensivne reset-oval na {},
        # cimz food tab spadl do 80s+ brute-force fetch loopu.
        tmp_path: Optional[str] = None
        try:
            tmp_dir = self.cache_path.parent
            with tempfile.NamedTemporaryFile(
                mode="w", encoding="utf-8", dir=tmp_dir,
                prefix=self.cache_path.name + ".", suffix=".tmp",
                delete=False,
            ) as tmp:
                json.dump(self.cache, tmp, ensure_ascii=False, indent=2)
                tmp.flush()
                os.fsync(tmp.fileno())
                tmp_path = tmp.name
            os.replace(tmp_path, self.cache_path)
        except OSError as e:
            print(f"[recipes] Nelze ulozit cache: {e}")
            if tmp_path:
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass

    def _fetch_from_gameinfo(self, item_id: str) -> Optional[Dict]:
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
        if self.bulk_data is not None:
            return

        # Cache parsed bulk dump na disk - 20MB items.json refetch je drahy.
        bulk_path = Path(BULK_DUMP_CACHE_FILE)
        if bulk_path.exists():
            try:
                with open(bulk_path, "r", encoding="utf-8") as f:
                    self.bulk_data = json.load(f)
                if isinstance(self.bulk_data, dict) and self.bulk_data:
                    print(f"[recipes] Bulk dump cache: {len(self.bulk_data)} receptu (z disku)")
                    return
            except (json.JSONDecodeError, OSError):
                print("[recipes] Bulk dump cache poskozeny, refetch")

        print("[recipes] Stahuji full items.json z ao-bin-dumps (~20 MB, jednou)...")
        try:
            resp = requests.get(AO_BIN_DUMPS_JSON, timeout=60)
            resp.raise_for_status()
            raw = resp.json()

            self.bulk_data = {}

            # ao-bin-dumps items.json ma TRI mozne formaty (historicky):
            #   1. flat list:    [{...}, {...}, ...]
            #   2. dict + list:  {"items": [{...}, {...}, ...]}
            #   3. dict + dict:  {"items": {"equipmentitem": [...], "consumableitem": [...]}}
            # Driv jsme cetli jen #3 -> u soucasnych dumpu (#1 nebo #2)
            # vracelo to 0 receptu. Tady normalizujeme na #3 (dict kategorii)
            # at zbytek loopu nemusime menit. Kategorii pak rozhodneme podle
            # samotnych itemu (pres @xsi:type nebo prefix idcka), ne struktury.
            if isinstance(raw, list):
                print(f"[recipes] items.json je flat LIST (len={len(raw)})")
                # Log sample meal item ať vidíme strukturu fields
                sample = next((it for it in raw if isinstance(it, dict) and "MEAL" in str(it.get("UniqueName", it.get("@uniquename", "")))), None)
                if sample is None and raw:
                    sample = next((it for it in raw if isinstance(it, dict)), None)
                if sample:
                    print(f"[recipes] sample item keys: {list(sample.keys())}")
                    print(f"[recipes] sample item (first 500 chars): {str(sample)[:500]}")
                items_root = {"_flat": raw}
            elif isinstance(raw, dict):
                top_keys = list(raw.keys())[:10]
                print(f"[recipes] items.json top-level keys: {top_keys}")
                inner = raw.get("items")
                if isinstance(inner, list):
                    print(f"[recipes] items.items je LIST (len={len(inner)})")
                    items_root = {"_flat": inner}
                elif isinstance(inner, dict):
                    root_keys = list(inner.keys())
                    print(f"[recipes] items.items kategorie ({len(root_keys)}): {root_keys[:15]}")
                    items_root = inner
                else:
                    # Mozna je dict ale top-level kategorie primo (bez "items" wrapperu)
                    print(f"[recipes] items.items typ: {type(inner).__name__} — zkusim raw jako kategorie")
                    items_root = raw
            else:
                print(f"[recipes] items.json neznamy typ: {type(raw).__name__}")
                items_root = {}

            # MEAL bug fix: items.json grupuje po kategoriich (equipmentitem,
            # weapon, consumableitem, simpleitem, mount, ...). Driv jsme cetli
            # jen "equipmentitem" -> meals (consumableitem) chybely a food
            # tab vracel 0 itemu. Iterujeme vsechny top-level kategorie.
            per_category: Dict[str, int] = {}
            for category, items_list in items_root.items():
                if isinstance(items_list, dict):
                    items_list = [items_list]
                if not isinstance(items_list, list):
                    continue
                cat_count = 0
                for item in items_list:
                    if not isinstance(item, dict):
                        continue
                    uid = item.get("@uniquename", "")
                    if not uid:
                        continue
                    craft = item.get("craftingrequirements")
                    if isinstance(craft, list):
                        craft = craft[0] if craft else None
                    if not isinstance(craft, dict):
                        continue

                    resources = []
                    res_list = craft.get("craftresource", [])
                    if isinstance(res_list, dict):
                        res_list = [res_list]
                    if not isinstance(res_list, list):
                        continue

                    for res in res_list:
                        if not isinstance(res, dict):
                            continue
                        rid = res.get("@uniquename", "")
                        try:
                            rcount = int(res.get("@count", 0))
                        except (TypeError, ValueError):
                            rcount = 0
                        if rid and rcount > 0:
                            resources.append({"id": rid, "count": rcount})

                    if resources:
                        try:
                            focus = int(craft.get("@craftingfocus", 0))
                        except (TypeError, ValueError):
                            focus = 0
                        try:
                            silver = int(craft.get("@silver", 0))
                        except (TypeError, ValueError):
                            silver = 0
                        try:
                            t_sec = float(craft.get("@time", 0))
                        except (TypeError, ValueError):
                            t_sec = 0.0
                        self.bulk_data[uid] = {
                            "item_id": uid,
                            "focus_cost": focus,
                            "silver_fee": silver,
                            "time_seconds": t_sec,
                            "resources": resources,
                            "source": "ao_bin_dumps",
                        }
                        cat_count += 1
                if cat_count > 0:
                    per_category[category] = cat_count

            cat_summary = ", ".join(f"{k}={v}" for k, v in sorted(per_category.items()))
            print(f"[recipes] Fallback dump nacten: {len(self.bulk_data)} receptu ({cat_summary})")

            # Persist na disk pro pristi spousteni
            try:
                bulk_path.parent.mkdir(parents=True, exist_ok=True)
                tmp_dir = bulk_path.parent
                with tempfile.NamedTemporaryFile(
                    mode="w", encoding="utf-8", dir=tmp_dir,
                    prefix=bulk_path.name + ".", suffix=".tmp",
                    delete=False,
                ) as tmp:
                    json.dump(self.bulk_data, tmp, ensure_ascii=False)
                    tmp.flush()
                    os.fsync(tmp.fileno())
                    tmp_path = tmp.name
                os.replace(tmp_path, bulk_path)
            except OSError as e:
                print(f"[recipes] Bulk dump cache nelze ulozit: {e}")
        except Exception as e:
            print(f"[recipes] Fallback dump selhal: {e}")
            self.bulk_data = {}

    def get_meal_ids_for_tiers(self, tiers: List[int]) -> List[str]:
        """Vrati autoritativni seznam meal item IDs pro dane tiery.

        Zdroj: item_names_cache.json (kompletni enumerace vsech IDs ve hre).
        Filtruje regexem na T{N}_MEAL_* a odstrihne enchanted varianty (@N).
        Bez tohoto by food code path spadl na 530-item brute-force.
        """
        if self._meal_ids_cache is None:
            grouped: Dict[int, List[str]] = {}
            try:
                with open(NAMES_CACHE_FILE, "r", encoding="utf-8") as f:
                    names_dump = json.load(f)
            except (OSError, json.JSONDecodeError) as e:
                print(f"[recipes] get_meal_ids_for_tiers: cache nedostupny ({e})")
                names_dump = {}

            pattern = re.compile(r"^T(\d+)_MEAL_[A-Z0-9_]+$")
            for iid in names_dump.keys():
                if "@" in iid:
                    continue
                m = pattern.match(iid)
                if not m:
                    continue
                grouped.setdefault(int(m.group(1)), []).append(iid)
            self._meal_ids_cache = grouped

        result: List[str] = []
        for t in tiers:
            result.extend(self._meal_ids_cache.get(t, []))
        return result

    def get_recipe(self, item_id: str, force_refresh: bool = False) -> Optional[Dict]:
        # None hodnoty z minulych behu (typicky meals pred fixem
        # _ensure_bulk_data) nezachovavame - zkusime znova z dumpu, ne uz
        # gameinfo. Bez tohohle by Restart backendu nepomohl, protoze cache
        # by porad vracela None.
        if not force_refresh and item_id in self.cache:
            cached = self.cache[item_id]
            if cached is not None:
                return cached
            # cached is None -> zkusime jeste dump (gameinfo uz selhalo)
            self._ensure_bulk_data()
            if self.bulk_data and item_id in self.bulk_data:
                recipe = self.bulk_data[item_id]
                self.cache[item_id] = recipe
                return recipe
            return None

        recipe = self._fetch_from_gameinfo(item_id)

        if recipe is None:
            self._ensure_bulk_data()
            if self.bulk_data and item_id in self.bulk_data:
                recipe = self.bulk_data[item_id]

        self.cache[item_id] = recipe
        return recipe

    def preload_recipes(self, item_ids: List[str], rate_limit_s: float = 0.15) -> Dict[str, Dict]:
        # Retry None entries: predtim se food cache poisonovaly None hodnotami
        # (pred fixem _ensure_bulk_data) a preload je preskakoval, protoze
        # `iid not in self.cache` byl False. Po fixu chceme None entries znovu
        # zkusit (get_recipe pak udela bulk_data fallback).
        to_fetch = [
            iid for iid in item_ids
            if iid not in self.cache or self.cache.get(iid) is None
        ]

        if to_fetch:
            print(f"[recipes] Stahuji {len(to_fetch)} novych receptu...")
            failed = 0
            for i, iid in enumerate(to_fetch, 1):
                result = self.get_recipe(iid)
                if result is None:
                    failed += 1
                if i % 20 == 0:
                    print(f"  [{i}/{len(to_fetch)}] ({failed} neznamych)")
                time.sleep(rate_limit_s)
            self._save_cache()
            print(f"[recipes] Cache ulozen ({len(self.cache)} receptu celkem, {failed} neznamych)")
        else:
            print(f"[recipes] Vsechny recepty v cache ({len(item_ids)} itemu)")

        return {iid: self.cache.get(iid) for iid in item_ids}


if __name__ == "__main__":
    loader = RecipeLoader()
    test_items = ["T4_ARMOR_PLATE_SET1", "T5_2H_CROSSBOW"]
    recipes = loader.preload_recipes(test_items)
    for iid, r in recipes.items():
        print(f"{iid}: {r}")
