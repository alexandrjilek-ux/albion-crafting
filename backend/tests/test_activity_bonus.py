"""Activities bonus normalization tests."""

from __future__ import annotations

from app.core.albion_crafting import (
    analyze_item,
    activity_bonus_applies_to_item,
    normalize_activity_bonus_category,
)
from app.core.refining_report import _activity_bonus_applies_to_refining


def test_activity_bonus_normalizes_common_staff_codes():
    assert normalize_activity_bonus_category("COMMON_FROSTSTAFF") == "FROST_STAFF"
    assert activity_bonus_applies_to_item("FROST_STAFF", ["COMMON_FROSTSTAFF"])


def test_common_food_applies_to_food_categories():
    assert activity_bonus_applies_to_item("PIE", ["COMMON_FOOD"])


def test_common_ore_applies_to_metalbar_refining():
    assert _activity_bonus_applies_to_refining("METALBAR", ["COMMON_ORE"])


def test_activity_bonus_reduces_crafting_effective_cost():
    item = {
        "item_id": "T4_SWORD",
        "category": "SWORD",
        "tier": 4,
        "resources": {"T4_PLANKS": 2},
        "focus_cost": 10,
    }
    prices = {
        ("T4_PLANKS", "Lymhurst"): {
            "sell_min": 100,
            "sell_updated": "2026-05-04T00:00:00Z",
        },
        ("T4_SWORD", "Lymhurst"): {
            "sell_min": 1_000,
            "sell_updated": "2026-05-04T00:00:00Z",
        },
    }

    base = analyze_item(
        item,
        prices,
        "Lymhurst",
        ["Lymhurst"],
        has_city_bonus=False,
        focus_budget=100,
        resource_avg_prices={},
        resource_avg_prices_all={},
        activity_bonus_categories=[],
    )[0]
    with_activity = analyze_item(
        item,
        prices,
        "Lymhurst",
        ["Lymhurst"],
        has_city_bonus=False,
        focus_budget=100,
        resource_avg_prices={},
        resource_avg_prices_all={},
        activity_bonus_categories=["COMMON_SWORD"],
    )[0]

    assert with_activity["has_activity_bonus"] is True
    assert with_activity["activity_bonus_rr_pct"] == 10.0
    assert with_activity["rr_focus_pct"] == base["rr_focus_pct"] + 10.0
    assert with_activity["eff_cost_focus"] < base["eff_cost_focus"]
