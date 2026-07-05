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


def test_sell_recommendation_uses_black_market_buy_orders(monkeypatch):
    def fake_fetch_prices(item_ids, locations, quality=1):
        assert "Black Market" in locations
        return {
            ("T4_BAG", "Bridgewatch"): {
                "sell_min": 1000,
                "sell_updated": "2026-07-04T10:00:00Z",
            },
            ("T4_BAG", "Black Market"): {
                "sell_min": 0,
                "buy_max": 6000,
                "buy_updated": "2026-07-04T10:00:00Z",
            },
        }

    def fake_fetch_history(item_ids, locations, days=7, quality=1):
        return {
            ("T4_BAG", "Bridgewatch"): [{"item_count": 10}],
            ("T4_BAG", "Black Market"): [{"item_count": 100}],
        }

    monkeypatch.setattr(sell_service, "fetch_prices", fake_fetch_prices)
    monkeypatch.setattr(sell_service, "fetch_history", fake_fetch_history)

    result = sell_service.get_sell_recommendations(
        from_city="Caerleon",
        history_days=7,
        include_black_market=True,
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
    assert result["include_black_market"] is True
    assert row["best_city"] == "Black Market"
    assert row["best_sell_min"] == 6000
    assert row["options"][0]["price_source"] == "black_market_buy_max"
    assert row["options"][0]["transport_fee"] == 0
    assert "black_market_buy_order" in row["options"][0]["risk_flags"]
    assert "transport_needed" not in row["options"][0]["risk_flags"]


def test_sell_market_mode_filters_destinations(monkeypatch):
    seen_locations = []

    def fake_fetch_prices(item_ids, locations, quality=1):
        seen_locations.append(list(locations))
        return {
            ("T4_BAG", location): {
                "sell_min": 1000,
                "buy_max": 2000,
                "sell_updated": "2026-07-04T10:00:00Z",
                "buy_updated": "2026-07-04T10:00:00Z",
            }
            for location in locations
        }

    def fake_fetch_history(item_ids, locations, days=7, quality=1):
        return {("T4_BAG", location): [{"item_count": 10}] for location in locations}

    monkeypatch.setattr(sell_service, "fetch_prices", fake_fetch_prices)
    monkeypatch.setattr(sell_service, "fetch_history", fake_fetch_history)

    item = SellItemInput(unique_name="T4_BAG", quantity=1, category="BAG", tier=4)

    royal = sell_service.get_sell_recommendations(
        from_city="Bridgewatch",
        history_days=7,
        market_mode="royal_no_caerleon",
        items=[item],
    )
    black_market = sell_service.get_sell_recommendations(
        from_city="Caerleon",
        history_days=7,
        market_mode="black_market_only",
        items=[item],
    )

    assert "Caerleon" not in seen_locations[0]
    assert "Black Market" not in seen_locations[0]
    assert seen_locations[1] == ["Black Market"]
    assert royal["market_mode"] == "royal_no_caerleon"
    assert royal["include_black_market"] is False
    assert black_market["market_mode"] == "black_market_only"
    assert black_market["include_black_market"] is True
    assert black_market["rows"][0]["best_city"] == "Black Market"


def test_sell_request_normalizes_ids_and_category():
    item = SellItemInput(unique_name=" t4_bag ", quantity=2, category=" bag ")
    assert item.unique_name == "T4_BAG"
    assert item.category == "BAG"
