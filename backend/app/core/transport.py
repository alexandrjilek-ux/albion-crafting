"""
Transport Fee Calculator - Minimální verze
===========================================

Počítá silver náklad na FAST TRAVEL (teleport) mezi Royal Cities.

Fee = total_weight_kg × FAST_TRAVEL_FEE_PER_KG

- Mezi Royal Cities (Bridgewatch, Martlock, Lymhurst, Thetford, Fort Sterling, Caerleon)
  je placený teleport cca 60 silver/kg.
- Caerleon JE dostupný přes fast travel stejně jako ostatní Royal Cities.
  (Caerleon portály do Outlands jsou jiná věc — to je cesta do Black Zone, ne mezi Royal Cities.)
"""

# Váha itemů podle kategorie a tieru (v kg)
ITEM_WEIGHT_KG = {
    "PLATE_ARMOR":    {4: 15.6, 5: 17.2, 6: 18.9, 7: 20.8, 8: 22.9},
    "PLATE_HELMET":   {4: 7.8,  5: 8.6,  6: 9.5,  7: 10.4, 8: 11.4},
    "PLATE_SHOES":    {4: 7.8,  5: 8.6,  6: 9.5,  7: 10.4, 8: 11.4},
    "LEATHER_ARMOR":  {4: 7.8,  5: 8.6,  6: 9.5,  7: 10.4, 8: 11.4},
    "LEATHER_HELMET": {4: 3.9,  5: 4.3,  6: 4.7,  7: 5.2,  8: 5.7},
    "LEATHER_SHOES":  {4: 3.9,  5: 4.3,  6: 4.7,  7: 5.2,  8: 5.7},
    "CLOTH_ARMOR":    {4: 3.9,  5: 4.3,  6: 4.7,  7: 5.2,  8: 5.7},
    "CLOTH_HELMET":   {4: 1.9,  5: 2.1,  6: 2.3,  7: 2.6,  8: 2.8},
    "CLOTH_SANDALS":  {4: 1.9,  5: 2.1,  6: 2.3,  7: 2.6,  8: 2.8},
    "SWORD":          {4: 7.8,  5: 8.6,  6: 9.5,  7: 10.4, 8: 11.4},
    "AXE":            {4: 7.8,  5: 8.6,  6: 9.5,  7: 10.4, 8: 11.4},
    "HAMMER":         {4: 7.8,  5: 8.6,  6: 9.5,  7: 10.4, 8: 11.4},
    "DAGGER":         {4: 7.8,  5: 8.6,  6: 9.5,  7: 10.4, 8: 11.4},
    "QUARTERSTAFF":   {4: 15.6, 5: 17.2, 6: 18.9, 7: 20.8, 8: 22.9},
    "BOW":            {4: 15.6, 5: 17.2, 6: 18.9, 7: 20.8, 8: 22.9},
    "CROSSBOW":       {4: 15.6, 5: 17.2, 6: 18.9, 7: 20.8, 8: 22.9},
    "FIRE_STAFF":     {4: 15.6, 5: 17.2, 6: 18.9, 7: 20.8, 8: 22.9},
    "CURSED_STAFF":   {4: 15.6, 5: 17.2, 6: 18.9, 7: 20.8, 8: 22.9},
    "ARCANE_STAFF":   {4: 15.6, 5: 17.2, 6: 18.9, 7: 20.8, 8: 22.9},
}

# Caerleon je normální Royal City s fast travelem — patří sem
ROYAL_CITIES = {"Bridgewatch", "Martlock", "Lymhurst", "Thetford", "Fort Sterling", "Caerleon"}
FAST_TRAVEL_FEE_PER_KG = 60


def calculate_transport(from_city: str, to_city: str, category: str, tier: int,
                         num_items: int, item_value: int = 0) -> dict:
    """
    Spočítá fast travel fee pro přesun dávky itemů mezi Royal Cities.

    Vrací dict s:
    - weight_per_item: váha 1 kusu (kg)
    - total_weight_kg: celková váha dávky
    - total_fee: total silver fee za fast travel
    - total_risk: expected loss (vždy 0 — fast travel je bezpečný)
    - total_cost: fee + risk
    - fee_per_item: total_cost / num_items
    - method_label: čitelný popis
    - is_feasible
    """
    weight_per_item = ITEM_WEIGHT_KG.get(category, {}).get(tier, 10.0)
    total_weight = weight_per_item * num_items

    result = {
        "weight_per_item": weight_per_item,
        "total_weight_kg": round(total_weight, 1),
        "total_fee": 0,
        "total_risk": 0,
        "total_cost": 0,
        "fee_per_item": 0,
        "num_items": num_items,
        "method_label": "✓ Stejné město",
        "is_feasible": True,
    }

    # Same city — 0 silver, 0 risk
    if from_city == to_city:
        return result

    # Mezi Royal Cities (včetně Caerleonu) — fast travel placený podle váhy
    if from_city in ROYAL_CITIES and to_city in ROYAL_CITIES:
        total_fee = total_weight * FAST_TRAVEL_FEE_PER_KG
        result.update({
            "total_fee": round(total_fee),
            "total_cost": round(total_fee),
            "fee_per_item": round(total_fee / num_items) if num_items > 0 else 0,
            "method_label": f"🚚 Fast travel ({int(total_weight):,} kg × 60 silver/kg)",
        })
        return result

    # Ostatní = nedostupné
    result["is_feasible"] = False
    result["method_label"] = "❌ Nedostupné"
    return result


if __name__ == "__main__":
    print("=" * 70)
    print("TRANSPORT FEE KALKULATOR (fast travel)")
    print("=" * 70)

    scenarios = [
        ("15 luku T4", "BOW", 4, 15, 8000),
        ("10 crossbow T5", "CROSSBOW", 5, 10, 38000),
        ("5 plate chest T5", "PLATE_ARMOR", 5, 5, 14000),
        ("15 dagger T4", "DAGGER", 4, 15, 9000),
    ]

    for label, cat, tier, count, value in scenarios:
        print(f"\n{label} Bridgewatch -> Martlock:")
        r = calculate_transport("Bridgewatch", "Martlock", cat, tier, count, value)
        print(f"  Vaha: {r['total_weight_kg']} kg ({r['weight_per_item']} kg x {count})")
        print(f"  {r['method_label']}")
        print(f"  Fee: {r['total_fee']:,} silver celkem, {r['fee_per_item']:,}/kus")

    print(f"\n15 dagger T4 Bridgewatch -> Caerleon:")
    r = calculate_transport("Bridgewatch", "Caerleon", "DAGGER", 4, 15, 9000)
    print(f"  {r['method_label']}")
    print(f"  Fee: {r['total_fee']:,} silver celkem, {r['fee_per_item']:,}/kus")

    print(f"\n15 dagger Bridgewatch -> Bridgewatch (same city):")
    r = calculate_transport("Bridgewatch", "Bridgewatch", "DAGGER", 4, 15, 9000)
    print(f"  {r['method_label']}")
    print(f"  Fee: {r['total_fee']:,} silver")
