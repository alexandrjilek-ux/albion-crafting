"""Refining service tests — mocked analyzer, no AODP calls."""

from __future__ import annotations

from app.core import refining_report
from app.services import refining_service


def test_refining_bonus_only_keeps_dedicated_refine_city(monkeypatch):
    def fake_analyze_refining(
        *,
        tiers,
        focus_budget,
        history_days,
        activity_bonus_categories,
        material,
        investment_budget,
        buy_city,
        refine_city,
        sell_city,
    ):
        return [
            {
                "mat_type": "METALBAR",
                "tier": tiers[0],
                "buy_city": "Bridgewatch",
                "refine_city": "Lymhurst",
                "sell_city": "Martlock",
                "has_bonus": True,
                "avg_daily_vol": 10,
                "profit_conservative": 100,
            },
            {
                "mat_type": "METALBAR",
                "tier": tiers[0],
                "buy_city": "Bridgewatch",
                "refine_city": "Martlock",
                "sell_city": "Martlock",
                "has_bonus": False,
                "avg_daily_vol": 10,
                "profit_conservative": 120,
            },
        ]

    monkeypatch.setattr(refining_service, "analyze_refining", fake_analyze_refining)

    result = refining_service.get_refining_opportunities(
        tiers=[4],
        focus_budget=10_000,
        investment_budget=1_000_000,
        material="METALBAR",
        buy_city="auto",
        refine_city="auto",
        sell_city="auto",
        history_days=7,
        min_volume=0,
        bonus_only=True,
        activity_bonus_categories=["COMMON_ORE"],
    )

    assert result["bonus_only"] is True
    assert result["activity_bonus_categories"] == ["COMMON_ORE"]
    assert result["investment_budget"] == 1_000_000
    assert result["material"] == "METALBAR"
    assert result["count"] == 1
    assert result["rows"][0]["buy_city"] == "Bridgewatch"
    assert result["rows"][0]["refine_city"] == "Lymhurst"


def test_refining_can_include_non_bonus_rows(monkeypatch):
    def fake_analyze_refining(
        *,
        tiers,
        focus_budget,
        history_days,
        activity_bonus_categories,
        material,
        investment_budget,
        buy_city,
        refine_city,
        sell_city,
    ):
        return [
            {"has_bonus": True, "avg_daily_vol": 10},
            {"has_bonus": False, "avg_daily_vol": 10},
        ]

    monkeypatch.setattr(refining_service, "analyze_refining", fake_analyze_refining)

    result = refining_service.get_refining_opportunities(
        tiers=[4],
        focus_budget=10_000,
        investment_budget=1_000_000,
        material=None,
        buy_city="auto",
        refine_city="auto",
        sell_city="auto",
        history_days=7,
        min_volume=0,
        bonus_only=False,
        activity_bonus_categories=[],
    )

    assert result["bonus_only"] is False
    assert result["count"] == 2


def test_refining_route_compares_buy_cities_for_bonus_city(monkeypatch):
    prices = {
        ("T4_ORE", "Bridgewatch"): {"sell_min": 100, "updated": "2026-05-12T10:00:00Z"},
        ("T3_METALBAR", "Bridgewatch"): {"sell_min": 120, "updated": "2026-05-12T10:00:00Z"},
        ("T4_ORE", "Lymhurst"): {"sell_min": 220, "updated": "2026-05-12T10:00:00Z"},
        ("T3_METALBAR", "Lymhurst"): {"sell_min": 260, "updated": "2026-05-12T10:00:00Z"},
        ("T4_METALBAR", "Lymhurst"): {"sell_min": 900, "updated": "2026-05-12T10:00:00Z"},
    }

    monkeypatch.setattr(refining_report, "fetch_prices", lambda item_ids, locations: prices)
    monkeypatch.setattr(refining_report, "fetch_history", lambda item_ids, locations, days=7: {})

    rows = refining_report.analyze_refining(
        tiers=[4],
        focus_budget=10_000,
        history_days=7,
        material="METALBAR",
        investment_budget=1_000_000,
        buy_city="auto",
        refine_city="auto",
        sell_city="Lymhurst",
    )

    assert rows
    best = rows[0]
    assert best["mat_type"] == "METALBAR"
    assert best["buy_city"] == "Bridgewatch"
    assert best["refine_city"] == "Lymhurst"
    assert best["has_bonus"] is True
    assert best["profit_for_investment_budget"] > 0
