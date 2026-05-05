"""Bonus calendar service tests — mocked public source, no network."""

from __future__ import annotations

from app.services import bonus_calendar_service


def test_bonus_calendar_extracts_public_source_labels(monkeypatch):
    html = (
        '"COMMON_SWORD",{"children":"Swords"}'
        '"HELLGATE",{"children":"Hellgate Frenzy"}'
        '"ORE",{"children":"Gathering Bonus: Ore"}'
        "Data: Apr 19, 2026 · Updated just now"
    )

    monkeypatch.setattr(bonus_calendar_service, "_fetch_source_html", lambda: html)

    result = bonus_calendar_service.get_bonus_calendar()

    assert result["daily_crafting"][0]["label"] == "Swords"
    assert result["rotating_activities"][0]["label"] == "Hellgate Frenzy"
    assert result["rotating_gathering"][0]["label"] == "Gathering Bonus: Ore"
    assert result["rotating_activities"][0]["duration_days_min"] == 2
    assert result["exact_week_schedule_available"] is False
    assert result["source_updated_label"] == "Data: Apr 19, 2026 · Updated just now"
