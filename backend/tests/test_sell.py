"""Sell service tests — mocked AODP calls, no network."""

from __future__ import annotations

from app.schemas.sell import SellItemInput
from app.services import sell_service


def test_sell_recommendation_picks_best_net_after_transport(monkeypatch):
    def fake_fetch_prices(item_ids, locations, quality=1):
        return {
            ("T4_BAG", "Bridgewatch"): {
                "sell_min": 1000,
                "sell_updated": "2026-05-04T00:00:00Z",
            },
            ("T4_BAG", "Martlock"): {
                "sell_min": 2000,
                "sell_updated": "2026-05-04T00:00:00Z",
            },
        }

    def fake_fetch_history(item_ids, locations, days=7, quality=1):
        return {
            ("T4_BAG", "Bridgewatch"): [{"item_count": 10}],
            ("T4_BAG", "Martlock"): [{"item_count": 20}],
        }

    monkeypatch.setattr(sell_service, "fetch_prices", fake_fetch_prices)
    monkeypatch.setattr(sell_service, "fetch_history", fake_fetch_history)

    result = sell_service.get_sell_recommendations(
        from_city="Bridgewatch",
        history_days=7,
        items=[
            SellItemInput(
                unique_name="T4_BAG",
                quantity=1,
                category="BAG",
                tier=4,
            )
        ],
    )

    row = result["rows"][0]
    assert row["best_city"] == "Martlock"
    assert row["best_net_revenue"] > 0
    assert row["options"][0]["market_tax"] == 80
    assert row["options"][0]["transport_fee"] > 0


def test_sell_request_normalizes_ids_and_category():
    item = SellItemInput(unique_name=" t4_bag ", quantity=2, category=" bag ")
    assert item.unique_name == "T4_BAG"
    assert item.category == "BAG"
