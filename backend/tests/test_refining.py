"""Refining service tests — mocked analyzer, no AODP calls."""

from __future__ import annotations

from app.core import refining_report
from app.services import refining_service


def test_refining_recipe_uses_tier_raw_multipliers():
    assert refining_report.build_refine_recipe("CLOTH", 2) == [("T2_FIBER", 1)]
    assert refining_report.build_refine_recipe("CLOTH", 4) == [
        ("T4_FIBER", 2),
        ("T3_CLOTH", 1),
    ]
    assert refining_report.build_refine_recipe("CLOTH", 5) == [
        ("T5_FIBER", 3),
        ("T4_CLOTH", 1),
    ]
    assert refining_report.build_refine_recipe("CLOTH", 8) == [
        ("T8_FIBER", 5),
        ("T7_CLOTH", 1),
    ]


def test_refining_return_rates_match_royal_city_reference():
    assert refining_report.RR_NO_FOCUS_BASE == 0.152
    assert refining_report.RR_NO_FOCUS_BONUS == 0.367
    assert refining_report.RR_FOCUS_BASE == 0.435
    assert refining_report.RR_FOCUS_BONUS == 0.539


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
        **kwargs,
    ):
        return [
            {
                "mat_type": "METALBAR",
                "tier": tiers[0],
                "buy_city": "Bridgewatch",
                "refine_city": "Thetford",
                "sell_city": "Thetford",
                "has_bonus": True,
                "avg_daily_vol": 10,
                "profit_conservative": 100,
            },
            {
                "mat_type": "METALBAR",
                "tier": tiers[0],
                "buy_city": "Bridgewatch",
                "refine_city": "Thetford",
                "sell_city": "Martlock",
                "has_bonus": True,
                "avg_daily_vol": 10,
                "profit_conservative": 140,
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
        price_mode="current",
        usage_fee_pct=1.5,
        market_tax_pct=4.0,
        return_rate_preset="bonus_city",
        custom_return_rate_pct=None,
        profitable_only=False,
        max_stale_hours=0,
        activity_bonus_categories=["COMMON_ORE"],
    )

    assert result["bonus_only"] is True
    assert result["activity_bonus_categories"] == ["COMMON_ORE"]
    assert result["investment_budget"] == 1_000_000
    assert result["material"] == "METALBAR"
    assert result["count"] == 1
    assert result["rows"][0]["buy_city"] == "Bridgewatch"
    assert result["rows"][0]["refine_city"] == "Thetford"
    assert result["rows"][0]["sell_city"] == "Thetford"


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
        **kwargs,
    ):
        return [
            {"has_bonus": True, "avg_daily_vol": 10, "refine_city": "Thetford", "sell_city": "Thetford"},
            {"has_bonus": False, "avg_daily_vol": 10, "refine_city": "Martlock", "sell_city": "Martlock"},
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
        price_mode="current",
        usage_fee_pct=1.5,
        market_tax_pct=4.0,
        return_rate_preset="bonus_city",
        custom_return_rate_pct=None,
        min_volume=0,
        bonus_only=False,
        profitable_only=False,
        max_stale_hours=0,
        activity_bonus_categories=[],
    )

    assert result["bonus_only"] is False
    assert result["count"] == 2


def test_refining_auto_sell_city_keeps_sale_in_refine_city(monkeypatch):
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
        **kwargs,
    ):
        return [
            {
                "mat_type": "STONEBLOCK",
                "tier": tiers[0],
                "refine_city": "Bridgewatch",
                "sell_city": "Bridgewatch",
                "has_bonus": True,
                "avg_daily_vol": 10,
                "profit_conservative": 80,
            },
            {
                "mat_type": "STONEBLOCK",
                "tier": tiers[0],
                "refine_city": "Bridgewatch",
                "sell_city": "Martlock",
                "has_bonus": True,
                "avg_daily_vol": 10,
                "profit_conservative": 160,
            },
        ]

    monkeypatch.setattr(refining_service, "analyze_refining", fake_analyze_refining)

    result = refining_service.get_refining_opportunities(
        tiers=[5],
        focus_budget=0,
        investment_budget=5_000_000,
        material="STONEBLOCK",
        buy_city="auto",
        refine_city="auto",
        sell_city="auto",
        history_days=7,
        price_mode="current",
        usage_fee_pct=1.5,
        market_tax_pct=4.0,
        return_rate_preset="bonus_city",
        custom_return_rate_pct=None,
        min_volume=0,
        bonus_only=True,
        profitable_only=False,
        max_stale_hours=0,
        activity_bonus_categories=[],
    )

    assert result["count"] == 1
    assert result["rows"][0]["refine_city"] == "Bridgewatch"
    assert result["rows"][0]["sell_city"] == "Bridgewatch"


def test_refining_route_compares_buy_cities_for_bonus_city(monkeypatch):
    prices = {
        ("T4_ORE", "Bridgewatch"): {"sell_min": 100, "updated": "2026-05-12T10:00:00Z"},
        ("T3_METALBAR", "Bridgewatch"): {"sell_min": 120, "updated": "2026-05-12T10:00:00Z"},
        ("T4_ORE", "Thetford"): {"sell_min": 220, "updated": "2026-05-12T10:00:00Z"},
        ("T3_METALBAR", "Thetford"): {"sell_min": 260, "updated": "2026-05-12T10:00:00Z"},
        ("T4_METALBAR", "Thetford"): {"sell_min": 900, "updated": "2026-05-12T10:00:00Z"},
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
        sell_city="Thetford",
    )

    assert rows
    best = rows[0]
    assert best["mat_type"] == "METALBAR"
    assert best["buy_city"] == "Bridgewatch"
    assert best["refine_city"] == "Thetford"
    assert best["has_bonus"] is True
    assert best["profit_for_investment_budget"] > 0
