"""Transport endpoint test — pure local math, no network."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_transport_same_city_is_free():
    resp = client.get(
        "/transport",
        params={
            "from_city": "Martlock",
            "to_city": "Martlock",
            "category": "PLATE_ARMOR",
            "tier": 4,
            "num_items": 50,
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["total_fee"] == 0
    assert body["total_cost"] == 0


def test_transport_between_royal_cities_charges_fee():
    resp = client.get(
        "/transport",
        params={
            "from_city": "Bridgewatch",
            "to_city": "Caerleon",
            "category": "PLATE_ARMOR",
            "tier": 5,
            "num_items": 10,
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    # Weight 17.2 kg/item × 10 items × 60 silver/kg = 10320
    assert body["total_weight_kg"] > 0
    assert body["total_fee"] > 0
    assert body["fee_per_item"] > 0


def test_transport_rejects_unknown_city():
    resp = client.get(
        "/transport",
        params={
            "from_city": "Atlantis",
            "to_city": "Caerleon",
            "category": "PLATE_ARMOR",
            "tier": 5,
            "num_items": 10,
        },
    )
    assert resp.status_code == 400
