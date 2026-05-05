"""
Item detail service — vrací recipe + aktuální ceny + price history pro
jeden konkrétní item (nebo enchanted variantu).

Použití z route /items/{unique_name}.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from app.core.albion_crafting import (
    CITY_BONUSES,
    _enchant_resource_id,
    fetch_history,
    fetch_prices,
)
from app.core.recipes import ItemNameLoader, RecipeLoader

# Royal cities = klíče CITY_BONUSES. Caerleon je tam taky (highest volume,
# žádný bonus). Pořadí stabilní pro UX.
ROYAL_CITIES: List[str] = list(CITY_BONUSES.keys())

# Render API pro icony — Sandbox Interactive hostuje per-item rendery.
# Quality 1 = normal. Format: T6_ARMOR_PLATE_SET1.png nebo T6_ARMOR_PLATE_SET1@1.png
ICON_BASE = "https://render.albiononline.com/v1/item"

# Mapování unique_name → kategorie. Zjednodušená heuristika z prefixu
# (přesný category resolve dělá albion_crafting přes recipe metadata, ale tady
# stačí broad bucket pro UI badge).
# Frontend si stejně může vytáhnout granular category z TopItemRow, který předal.
_CATEGORY_PATTERNS: List[Tuple[re.Pattern, str]] = [
    (re.compile(r"_MEAL_"), "FOOD"),
    (re.compile(r"_POTION_"), "POTION"),
    (re.compile(r"_HEAD_PLATE"), "PLATE_HELMET"),
    (re.compile(r"_HEAD_LEATHER"), "LEATHER_HELMET"),
    (re.compile(r"_HEAD_CLOTH"), "CLOTH_HELMET"),
    (re.compile(r"_ARMOR_PLATE"), "PLATE_ARMOR"),
    (re.compile(r"_ARMOR_LEATHER"), "LEATHER_ARMOR"),
    (re.compile(r"_ARMOR_CLOTH"), "CLOTH_ARMOR"),
    (re.compile(r"_SHOES_PLATE"), "PLATE_SHOES"),
    (re.compile(r"_SHOES_LEATHER"), "LEATHER_SHOES"),
    (re.compile(r"_SHOES_CLOTH"), "CLOTH_SHOES"),
    (re.compile(r"_2H_BOW"), "BOW"),
    (re.compile(r"_2H_CROSSBOW"), "CROSSBOW"),
    (re.compile(r"_MAIN_SWORD|_2H_CLAYMORE"), "SWORD"),
    (re.compile(r"_MAIN_DAGGER|_2H_DAGGER"), "DAGGER"),
    (re.compile(r"_MAIN_HAMMER|_2H_HAMMER"), "HAMMER"),
    (re.compile(r"_MAIN_AXE|_2H_AXE"), "AXE"),
    (re.compile(r"_MAIN_MACE|_2H_MACE"), "MACE"),
    (re.compile(r"_MAIN_SPEAR|_2H_SPEAR"), "SPEAR"),
    (re.compile(r"_2H_QUARTERSTAFF"), "QUARTERSTAFF"),
    (re.compile(r"_FIRESTAFF|_2H_FIRESTAFF"), "FIRE_STAFF"),
    (re.compile(r"_FROSTSTAFF|_2H_FROSTSTAFF"), "FROST_STAFF"),
    (re.compile(r"_HOLYSTAFF|_2H_HOLYSTAFF"), "HOLY_STAFF"),
    (re.compile(r"_NATURESTAFF|_2H_NATURESTAFF"), "NATURE_STAFF"),
    (re.compile(r"_ARCANESTAFF"), "ARCANE_STAFF"),
    (re.compile(r"_CURSEDSTAFF"), "CURSED_STAFF"),
    (re.compile(r"_SHIELD"), "SHIELD"),
    (re.compile(r"_TORCH"), "TORCH"),
    (re.compile(r"_HORN"), "HORN"),
    (re.compile(r"_BOOK"), "BOOK"),
    (re.compile(r"_ORB"), "ORB"),
]


def _parse_unique_name(unique_name: str) -> Tuple[str, int]:
    """
    'T6_ARMOR_PLATE_SET1@2' → ('T6_ARMOR_PLATE_SET1', 2)
    'T4_MEAL_PIE'           → ('T4_MEAL_PIE', 0)
    """
    if "@" in unique_name:
        base, _, tail = unique_name.partition("@")
        try:
            ench = int(tail)
        except ValueError:
            ench = 0
        return base, ench
    return unique_name, 0


def _extract_tier(base_id: str) -> Optional[int]:
    m = re.match(r"^T(\d+)_", base_id)
    if not m:
        return None
    try:
        return int(m.group(1))
    except ValueError:
        return None


def _extract_category(base_id: str) -> Optional[str]:
    for pattern, cat in _CATEGORY_PATTERNS:
        if pattern.search(base_id):
            return cat
    return None


def _icon_url(unique_name: str) -> str:
    # Render API přijímá i @N variantu — vrátí render s glow.
    return f"{ICON_BASE}/{unique_name}.png"


def _is_enchantable_resource_id(resource_id: str) -> bool:
    if "@" in resource_id or "_LEVEL" in resource_id:
        return False
    return bool(
        re.match(
            r"^T[2-8]_(ORE|WOOD|HIDE|FIBER|ROCK|METALBAR|PLANKS|LEATHER|CLOTH|STONEBLOCK)$",
            resource_id,
        )
    )


def _build_materials_for_enchant(
    base_resources: List[Dict[str, Any]], enchant: int
) -> List[Dict[str, Any]]:
    """
    Recipe je vždy uložený pro base item. Pro enchanted variantu musíme
    zenchantovat suroviny (refined resources mají _LEVEL{N}@{N} variantu).
    """
    if enchant == 0:
        return list(base_resources)
    transformed = []
    for r in base_resources:
        rid = r.get("id", "")
        cnt = r.get("count", 0)
        transformed.append({
            "id": _enchant_resource_id(rid, enchant) if _is_enchantable_resource_id(rid) else rid,
            "count": cnt,
        })
    return transformed


def get_item_detail(
    unique_name: str,
    history_days: int = 14,
    quality: int = 1,
) -> Dict[str, Any]:
    """
    Načte item detail.
    Vrací slovník odpovídající ItemDetailResponse schématu.
    """
    base_id, enchant = _parse_unique_name(unique_name)

    # 1) Recipe + name. Tyhle jsou levné (cache hit), takže dělej hned.
    recipe_loader = RecipeLoader()
    name_loader = ItemNameLoader()

    raw_recipe = recipe_loader.get_recipe(base_id)
    item_name = name_loader.get_name(base_id) or base_id

    tier = _extract_tier(base_id)
    category = _extract_category(base_id)

    warnings: List[str] = []

    # 2) Postavíme recipe blok (může být None pokud item nemá recept — třeba
    # raw resources, runy, journals). UI zobrazí jen item prices.
    recipe_dict: Optional[Dict[str, Any]] = None
    materials_to_price: List[Dict[str, Any]] = []
    if raw_recipe is not None:
        materials_raw = raw_recipe.get("resources", []) or []
        materials_enchanted = _build_materials_for_enchant(materials_raw, enchant)
        materials_with_names = []
        for m in materials_enchanted:
            mid = m.get("id", "")
            mname = name_loader.get_name(mid) or mid
            materials_with_names.append(
                {"unique_name": mid, "name": mname, "count": int(m.get("count", 0))}
            )
            materials_to_price.append(m)
        recipe_dict = {
            "item_id": base_id,
            "name": raw_recipe.get("name_en") or item_name,
            "focus_cost": raw_recipe.get("focus_cost"),
            "silver_fee": raw_recipe.get("silver_fee"),
            "time_seconds": raw_recipe.get("time_seconds"),
            "materials": materials_with_names,
            "source": raw_recipe.get("source"),
        }
    else:
        warnings.append(
            f"Recept pro {base_id} nenalezen (Gameinfo + ao-bin-dumps fallback "
            f"selhaly). Item může být uncraftable nebo má neobvyklé ID."
        )

    # 3) Sbíráme item IDs pro AODP. Item samotný (s @N) + suroviny (už s @N
    # pro enchanty).
    aodp_ids: List[str] = [unique_name]
    for m in materials_to_price:
        mid = m.get("id", "")
        if mid and mid not in aodp_ids:
            aodp_ids.append(mid)

    # 4) Aktuální ceny — všechny royal cities.
    try:
        prices_raw = fetch_prices(aodp_ids, ROYAL_CITIES, quality=quality)
    except Exception as exc:  # noqa: BLE001
        prices_raw = {}
        warnings.append(f"AODP prices fetch failed: {type(exc).__name__}: {exc}")

    # 5) History — jenom item samotný (suroviny by zbytečně zatížily AODP).
    try:
        history_raw = fetch_history(
            [unique_name], ROYAL_CITIES, days=history_days, quality=quality
        )
    except Exception as exc:  # noqa: BLE001
        history_raw = {}
        warnings.append(f"AODP history fetch failed: {type(exc).__name__}: {exc}")

    # 6) Mapujeme ceny z `{(item_id, city): {...}}` do struktur per item.
    def _city_prices_for(item_id: str) -> List[Dict[str, Any]]:
        out = []
        for city in ROYAL_CITIES:
            entry = prices_raw.get((item_id, city), {})
            out.append(
                {
                    "city": city,
                    "sell_min": int(entry.get("sell_min", 0) or 0),
                    "buy_max": int(entry.get("buy_max", 0) or 0),
                    "sell_updated": entry.get("sell_updated", "") or "",
                    "buy_updated": entry.get("buy_updated", "") or "",
                }
            )
        return out

    item_prices = _city_prices_for(unique_name)

    material_prices: List[Dict[str, Any]] = []
    if recipe_dict is not None:
        for mat in recipe_dict["materials"]:
            material_prices.append(
                {
                    "unique_name": mat["unique_name"],
                    "name": mat["name"],
                    "count": mat["count"],
                    "prices": _city_prices_for(mat["unique_name"]),
                }
            )

    # 7) History per city.
    history_blocks: List[Dict[str, Any]] = []
    for city in ROYAL_CITIES:
        points = history_raw.get((unique_name, city), [])
        history_blocks.append(
            {
                "city": city,
                "points": [
                    {
                        "date": p.get("date", ""),
                        "avg_price": int(p.get("avg_price", 0) or 0),
                        "item_count": int(p.get("item_count", 0) or 0),
                    }
                    for p in points
                ],
            }
        )

    return {
        "unique_name": unique_name,
        "base_id": base_id,
        "enchant": enchant,
        "name": item_name,
        "tier": tier,
        "category": category,
        "icon_url": _icon_url(unique_name),
        "recipe": recipe_dict,
        "item_prices": item_prices,
        "material_prices": material_prices,
        "history": history_blocks,
        "history_days": history_days,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "warning": "; ".join(warnings) if warnings else None,
    }
