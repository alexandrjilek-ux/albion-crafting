"""Item autocomplete service."""

from __future__ import annotations

from typing import Any, Dict, List

from app.core.recipes import ItemNameLoader
from app.services.item_detail_service import _extract_category, _extract_tier


def search_items(query: str, limit: int = 12) -> Dict[str, Any]:
    """Search local item-name cache by readable name or AODP id."""
    q = query.strip()
    if len(q) < 2:
        return {"rows": [], "count": 0, "query": query}

    needle = q.casefold()
    id_needle = q.upper()
    loader = ItemNameLoader()

    scored: List[tuple[int, str, str]] = []
    for unique_name, name in loader.names.items():
        hay_name = name.casefold()
        hay_id = unique_name.upper()
        score = None
        if hay_id == id_needle:
            score = 0
        elif hay_name.startswith(needle):
            score = 1
        elif hay_id.startswith(id_needle):
            score = 2
        elif needle in hay_name:
            score = 3
        elif id_needle in hay_id:
            score = 4
        if score is not None:
            scored.append((score, unique_name, name))

    scored.sort(key=lambda row: (row[0], len(row[2]), row[2]))
    rows = [
        {
            "unique_name": unique_name,
            "name": name,
            "tier": _extract_tier(unique_name),
            "category": _extract_category(unique_name),
        }
        for _, unique_name, name in scored[:limit]
    ]
    return {"rows": rows, "count": len(rows), "query": query}
