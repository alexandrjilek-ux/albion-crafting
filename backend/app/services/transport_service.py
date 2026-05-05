"""Wrapper around `transport.calculate_transport`."""

from typing import Any, Dict

from app.core.transport import ITEM_WEIGHT_KG, ROYAL_CITIES, calculate_transport


def calc_transport(
    *,
    from_city: str,
    to_city: str,
    category: str,
    tier: int,
    num_items: int,
    item_value: int = 0,
) -> Dict[str, Any]:
    """Validate inputs, call the core calculator, return its dict."""
    if from_city not in ROYAL_CITIES:
        raise ValueError(f"Unknown from_city '{from_city}'. Valid: {sorted(ROYAL_CITIES)}")
    if to_city not in ROYAL_CITIES:
        raise ValueError(f"Unknown to_city '{to_city}'. Valid: {sorted(ROYAL_CITIES)}")
    if category not in ITEM_WEIGHT_KG:
        raise ValueError(
            f"Unknown category '{category}'. Valid: {sorted(ITEM_WEIGHT_KG.keys())}"
        )
    if tier not in {4, 5, 6, 7, 8}:
        raise ValueError(f"Tier must be 4–8, got {tier}")
    if num_items < 1:
        raise ValueError(f"num_items must be >= 1, got {num_items}")

    result = calculate_transport(
        from_city=from_city,
        to_city=to_city,
        category=category,
        tier=tier,
        num_items=num_items,
        item_value=item_value,
    )
    # Augment with input echo so the response includes context
    return {
        "from_city": from_city,
        "to_city": to_city,
        "category": category,
        "tier": tier,
        "num_items": num_items,
        **result,
    }
