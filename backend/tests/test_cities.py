"""Sanity test for the static /cities endpoint — no network calls involved."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_cities_returns_all_royal_cities():
    resp = client.get("/cities")
    assert resp.status_code == 200
    body = resp.json()

    names = {c["name"] for c in body["cities"]}
    expected = {"Bridgewatch", "Martlock", "Lymhurst", "Thetford", "Fort Sterling", "Caerleon"}
    assert expected <= names, f"Missing cities: {expected - names}"


def test_cities_bonus_payload_structure():
    body = client.get("/cities").json()
    assert isinstance(body["equipment_bonuses"], dict)
    assert isinstance(body["food_bonuses"], dict)

    martlock = next(c for c in body["cities"] if c["name"] == "Martlock")
    caerleon = next(c for c in body["cities"] if c["name"] == "Caerleon")
    # Food crafting bonus drzi Caerleon; Martlock zustava equipment bonus.
    assert "SHIELD" in martlock["equipment_categories"]
    assert "PIE" in caerleon["food_categories"]
