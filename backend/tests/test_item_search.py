"""Item search service tests."""

from __future__ import annotations

from app.services import item_search_service


class FakeNameLoader:
    names = {
        "T4_BAG": "Adept's Bag",
        "T5_PLANKS": "Cedar Planks",
        "T4_MAIN_SWORD": "Adept's Broadsword",
    }


def test_item_search_finds_by_name(monkeypatch):
    monkeypatch.setattr(item_search_service, "ItemNameLoader", FakeNameLoader)

    result = item_search_service.search_items("bag")

    assert result["count"] == 1
    assert result["rows"][0]["unique_name"] == "T4_BAG"
    assert result["rows"][0]["tier"] == 4


def test_item_search_finds_by_id(monkeypatch):
    monkeypatch.setattr(item_search_service, "ItemNameLoader", FakeNameLoader)

    result = item_search_service.search_items("T5_PL")

    assert result["rows"][0]["unique_name"] == "T5_PLANKS"
