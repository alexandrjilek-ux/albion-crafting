"""Refining service tests — mocked analyzer, no AODP calls."""

from __future__ import annotations

from app.services import refining_service


def test_refining_bonus_only_keeps_dedicated_refine_city(monkeypatch):
    def fake_analyze_refining(*, tiers, focus_budget, history_days, activity_bonus_categories):
        return [
            {
                "mat_type": "METALBAR",
                "tier": tiers[0],
                "refine_city": "Thetford",
                "sell_city": "Martlock",
                "has_bonus": True,
                "avg_daily_vol": 10,
                "profit_conservative": 100,
            },
            {
                "mat_type": "METALBAR",
                "tier": tiers[0],
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
        history_days=7,
        min_volume=0,
        bonus_only=True,
        activity_bonus_categories=["COMMON_ORE"],
    )

    assert result["bonus_only"] is True
    assert result["activity_bonus_categories"] == ["COMMON_ORE"]
    assert result["count"] == 1
    assert result["rows"][0]["refine_city"] == "Thetford"


def test_refining_can_include_non_bonus_rows(monkeypatch):
    def fake_analyze_refining(*, tiers, focus_budget, history_days, activity_bonus_categories):
        return [
            {"has_bonus": True, "avg_daily_vol": 10},
            {"has_bonus": False, "avg_daily_vol": 10},
        ]

    monkeypatch.setattr(refining_service, "analyze_refining", fake_analyze_refining)

    result = refining_service.get_refining_opportunities(
        tiers=[4],
        focus_budget=10_000,
        history_days=7,
        min_volume=0,
        bonus_only=False,
        activity_bonus_categories=[],
    )

    assert result["bonus_only"] is False
    assert result["count"] == 2
