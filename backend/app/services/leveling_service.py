"""Wrapper around `leveling_cost.calculate_leveling_path`."""

from datetime import datetime, timezone
from typing import Any, Dict

from app.core.leveling_cost import (
    LEVELING_ITEMS,
    calculate_leveling_path,
    fetch_prices,
)
from app.core.recipes import RecipeLoader


# Pre-load recipes once on first call. RecipeLoader internally caches
# to disk so re-instantiation is cheap, but a module-level singleton
# avoids repeated JSON parsing.
_recipe_loader: RecipeLoader | None = None


def _get_recipe_loader() -> RecipeLoader:
    global _recipe_loader
    if _recipe_loader is None:
        _recipe_loader = RecipeLoader()
    return _recipe_loader


def get_leveling_paths(*, city: str, use_journal: bool) -> Dict[str, Any]:
    """
    Build leveling paths for every item in LEVELING_ITEMS at the given city.

    Returns rows sorted by silver-per-fame (ascending = better).
    """
    loader = _get_recipe_loader()

    # Build the list of every tier-variant ID we need prices for, so the
    # AODP fetch happens once instead of N times inside the loop.
    item_ids: list[str] = []
    for item_key in LEVELING_ITEMS:
        for tier in (2, 3, 4):
            base_id = f"T{tier}_{item_key}"
            item_ids.append(base_id)
            # T4 expert variant uses .1 enchant suffix? No — Expert is just
            # a higher node on T4 destiny board, same item ID. The path
            # function handles tier mapping internally.

    # Pull recipes for every item via loader (cached).
    recipes: dict = {}
    for item_id in item_ids:
        recipe = loader.get_recipe(item_id)
        if recipe:
            recipes[item_id] = recipe

    # Single price fetch — one call covers all items × cities.
    cities = [city]
    prices = fetch_prices(item_ids, cities)

    rows: list[dict] = []
    for item_key, item_info in LEVELING_ITEMS.items():
        result = calculate_leveling_path(
            item_key=item_key,
            item_info=item_info,
            prices=prices,
            city=city,
            recipes=recipes,
            use_journal=use_journal,
        )
        if result:
            rows.append(result)

    # Sort by silver_per_fame ascending (lower = cheaper to level)
    rows.sort(key=lambda r: r.get("silver_per_fame", float("inf")))

    return {
        "rows": rows,
        "count": len(rows),
        "city": city,
        "use_journal": use_journal,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
