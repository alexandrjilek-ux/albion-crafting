"""Static city bonus reference — no runtime calls."""

from typing import Any, Dict, List

from app.core.albion_crafting import CITY_BONUSES, FOOD_CITY_BONUSES
from app.core.refining_report import REFINE_BONUSES


def get_cities_reference() -> Dict[str, Any]:
    """Combine equipment, food, and refining bonuses into one payload."""
    cities: List[Dict[str, Any]] = []
    all_names = set(CITY_BONUSES) | set(FOOD_CITY_BONUSES) | set(REFINE_BONUSES)
    for name in sorted(all_names):
        cities.append(
            {
                "name": name,
                "equipment_categories": CITY_BONUSES.get(name, []),
                "food_categories": FOOD_CITY_BONUSES.get(name, []),
                "refining_material": REFINE_BONUSES.get(name),
            }
        )
    return {
        "cities": cities,
        "equipment_bonuses": CITY_BONUSES,
        "food_bonuses": FOOD_CITY_BONUSES,
    }
