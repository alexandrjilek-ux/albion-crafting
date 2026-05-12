"""
Albion Online Refining Profit Analyzer
=======================================
Analyzuje ziskovost refiningu (surovina → zpracovaná surovina) v každém městě.

Podporované materiály: ORE→METALBAR, WOOD→PLANKS, HIDE→LEATHER, FIBER→CLOTH, ROCK→STONEBLOCK

Použití:
    python refining_report.py --tiers 4,5,6,7,8 --focus-budget 10000

Výstup:
    - refining_report_YYYY-MM-DD.html
    - refining_report_YYYY-MM-DD.csv
"""

import argparse
import csv
import json
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.parse import quote

from app.core.albion_crafting import (
    ACTIVITY_RETURN_RATE_BONUS,
    _aodp_get_json,
    _clamp_return_rate,
    normalize_activity_bonus_categories,
)

# ============================================================
# KONFIGURACE
# ============================================================

AODP_BASE = "https://europe.albion-online-data.com/api/v2/stats"

ALL_CITIES = ["Fort Sterling", "Bridgewatch", "Lymhurst", "Martlock", "Thetford", "Caerleon"]

# Refining bonusy — každé město má bonus na REFINING jednoho materiálu
# POZOR: refining bonus ≠ crafting bonus (jsou to různé věci!)
#   Crafting bonus Bridgewatch = plate armor, crossbow...
#   Refining bonus Bridgewatch = stone
REFINE_BONUSES = {
    "Lymhurst":      "METALBAR",   # Ore → Metal Bar
    "Thetford":      "PLANKS",     # Wood → Planks
    "Caerleon":      "LEATHER",    # Hide → Leather
    "Fort Sterling": "CLOTH",      # Fiber → Cloth
    "Bridgewatch":   "STONEBLOCK", # Rock → Stone Blocks
    "Martlock":      None,
}

# Metadata pro každý typ materiálu
REFINE_MATERIALS = {
    "METALBAR":  {"raw": "ORE",   "label": "Metal Bar", "emoji": "⚙️",  "color": "#a0b4c8"},
    "PLANKS":    {"raw": "WOOD",  "label": "Planks",    "emoji": "🪵",  "color": "#c8a060"},
    "LEATHER":   {"raw": "HIDE",  "label": "Leather",   "emoji": "🐄",  "color": "#c87840"},
    "CLOTH":     {"raw": "FIBER", "label": "Cloth",     "emoji": "🧵",  "color": "#a070d0"},
    "STONEBLOCK": {"raw": "ROCK", "label": "Stone Blocks", "emoji": "◇", "color": "#8792a0"},
}

# Return rate při refiningu
# Stejná logika jako při craftingu — viz albion_crafting.py
RR_FOCUS_BASE  = 0.479   # s focusem, bez city bonusu
RR_FOCUS_BONUS = 0.629   # s focusem + city bonus
RR_NO_FOCUS_BASE  = 0.152
RR_NO_FOCUS_BONUS = 0.362

MARKET_TAX = 0.04        # 4% market tax s premium
REFINE_STATION_FEE_RATE = 0.015
FAST_TRAVEL_FEE_PER_KG = 60
REFINED_WEIGHT_KG = 0.2
RAW_WEIGHT_KG = 1.0

# Focus cost za 1 refined item (aproximace — Gameinfo API hodnoty)
# Refining stojí méně focusu než crafting itemů ze stejného tieru
REFINE_FOCUS = {2: 15, 3: 30, 4: 60, 5: 120, 6: 240, 7: 480, 8: 960}

REFINE_ACTIVITY_TO_MATERIAL = {
    "ORE": "METALBAR",
    "WOOD": "PLANKS",
    "HIDE": "LEATHER",
    "FIBER": "CLOTH",
    "ROCK": "STONEBLOCK",
}


def _activity_bonus_applies_to_refining(mat_type: str, activity_bonus_categories) -> bool:
    active = normalize_activity_bonus_categories(activity_bonus_categories)
    raw_type = REFINE_MATERIALS[mat_type]["raw"]
    return (
        mat_type in active
        or raw_type in active
        or REFINE_ACTIVITY_TO_MATERIAL.get(raw_type) in active
    )

# Recepty pro refining (pevné — nemění se s patchem)
# T2: jen 2x raw → 1x refined  (žádná lower tier složka)
# T3+: 2x Tn_raw + 1x T(n-1)_refined → 1x Tn_refined
def build_refine_recipe(mat_type: str, tier: int):
    """Vrátí list inputů pro refining. Každý input = (item_id, quantity)."""
    raw_id = f"T{tier}_{REFINE_MATERIALS[mat_type]['raw']}"
    inputs = [(raw_id, 2)]
    if tier >= 3:
        lower_refined_id = f"T{tier - 1}_{mat_type}"
        inputs.append((lower_refined_id, 1))
    return inputs


# ============================================================
# AODP — stahování cen
# ============================================================

def fetch_prices(item_ids: list, locations: list) -> dict:
    """
    Stáhne aktuální sell_min pro zadané item_ids ve všech locationss.
    Vrátí dict: {(item_id, city): {"sell_min": X, "updated": ts}}
    """
    if not item_ids:
        return {}
    result = {}
    batch_size = 50
    for i in range(0, len(item_ids), batch_size):
        batch = item_ids[i:i + batch_size]
        ids_str = ",".join(batch)
        locs_str = ",".join(quote(city, safe="") for city in locations)
        url = f"{AODP_BASE}/prices/{ids_str}.json?locations={locs_str}&qualities=1"
        rows = _aodp_get_json(url, label="refining prices")
        if rows is None:
            continue

        for row in rows:
            city = row.get("city", "")
            iid = row.get("item_id", "")
            sell = row.get("sell_price_min", 0) or 0
            upd = row.get("sell_price_min_date", "")
            if city and iid and sell > 0:
                result[(iid, city)] = {"sell_min": sell, "updated": upd}
    return result
    ids_str = ",".join(item_ids)
    locs_str = ",".join(locations)
    url = f"{AODP_BASE}/prices/{ids_str}?locations={locs_str}&qualities=1"
    try:
        resp = requests.get(url, timeout=20)
        resp.raise_for_status()
        rows = resp.json()
    except Exception as e:
        print(f"  [!] Chyba při stahování cen: {e}")
        return {}

    result = {}
    for row in rows:
        city = row.get("city", "")
        iid  = row.get("item_id", "")
        sell = row.get("sell_price_min", 0) or 0
        upd  = row.get("sell_price_min_date", "")
        if city and iid and sell > 0:
            result[(iid, city)] = {"sell_min": sell, "updated": upd}
    return result


def fetch_history(item_ids: list, locations: list, days: int = 7) -> dict:
    """
    Stáhne 7-denní historii pro item_ids.
    Vrátí dict: {(item_id, city): [{"date": ..., "avg_price": ..., "item_count": ...}]}
    """
    if not item_ids:
        return {}
    result = {}
    cutoff_dt = datetime.now(timezone.utc) - timedelta(days=days)
    batch_size = 30
    for i in range(0, len(item_ids), batch_size):
        batch = item_ids[i:i + batch_size]
        ids_str = ",".join(batch)
        locs_str = ",".join(quote(city, safe="") for city in locations)
        url = (
            f"{AODP_BASE}/history/{ids_str}.json"
            f"?locations={locs_str}&qualities=1&time-scale=24"
        )
        rows = _aodp_get_json(url, label="refining history")
        if rows is None:
            continue

        for row in rows:
            city = row.get("location", "")
            iid = row.get("item_id", "")
            data = row.get("data", [])
            if not city or not iid or not data:
                continue
            parsed = []
            for p in data:
                ts = p.get("timestamp", "")
                dt = _parse_ts(ts)
                avg_price = p.get("avg_price", 0)
                if dt is not None and dt >= cutoff_dt and avg_price > 0:
                    parsed.append({
                        "date": ts,
                        "avg_price": avg_price,
                        "item_count": p.get("item_count", 0),
                    })
            if parsed:
                parsed.sort(key=lambda point: point["date"])
                result[(iid, city)] = parsed
    return result
    ids_str = ",".join(item_ids)
    locs_str = ",".join(locations)
    url = f"{AODP_BASE}/charts/{ids_str}?locations={locs_str}&date={days}&qualities=1"
    try:
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
        rows = resp.json()
    except Exception as e:
        print(f"  [!] Chyba při stahování historie: {e}")
        return {}

    result = {}
    for row in rows:
        city = row.get("location", "")
        iid  = row.get("item_id", "")
        data = row.get("data", [])
        if city and iid and data:
            parsed = [
                {"date": p.get("timestamp", "")[:10],
                 "avg_price": p.get("avg_price", 0),
                 "item_count": p.get("item_count", 0)}
                for p in data if p.get("avg_price", 0) > 0
            ]
            if parsed:
                result[(iid, city)] = parsed
    return result


# ============================================================
# HELPER FUNKCE
# ============================================================

def _parse_ts(ts: str):
    if not ts:
        return None
    try:
        t = ts[:-1] if ts.endswith("Z") else ts
        dt = datetime.fromisoformat(t)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


def _median_price(hist_data: list) -> int:
    prices = sorted(p.get("avg_price", 0) for p in hist_data if p.get("avg_price", 0) > 0)
    if not prices:
        return 0
    mid = len(prices) // 2
    if len(prices) % 2 == 0:
        return round((prices[mid - 1] + prices[mid]) / 2)
    return round(prices[mid])


def _avg_daily_volume(hist_data: list) -> int:
    if not hist_data:
        return 0
    return round(sum(p.get("item_count", 0) for p in hist_data) / len(hist_data))


def _price_age_hours(ts: str):
    dt = _parse_ts(ts)
    if dt is None:
        return None
    return max(0.0, (datetime.now(timezone.utc) - dt).total_seconds() / 3600)


def _transport_fee_for_weight(from_city: str, to_city: str, weight_kg: float) -> int:
    if from_city == to_city:
        return 0
    return round(weight_kg * FAST_TRAVEL_FEE_PER_KG)


def _item_weight_kg(item_id: str) -> float:
    return REFINED_WEIGHT_KG if any(item_id.endswith(suffix) for suffix in REFINE_MATERIALS) else RAW_WEIGHT_KG


def _risk_adjusted(row: dict, focus_budget: int, investment_budget: int) -> dict:
    risk_flags = []
    confidence = 100

    if row["avg_daily_vol"] <= 0:
        risk_flags.append("no_volume_history")
        confidence -= 30
    elif row["avg_daily_vol"] < 5:
        risk_flags.append("thin_market")
        confidence -= 20

    age_h = _price_age_hours(row.get("sell_updated", ""))
    if age_h is None:
        risk_flags.append("unknown_sell_age")
        confidence -= 15
    elif age_h > 24:
        risk_flags.append("stale_sell_price")
        confidence -= 20
    elif age_h > 6:
        risk_flags.append("older_sell_price")
        confidence -= 10

    if row["sell_city"] != row["refine_city"]:
        risk_flags.append("cross_city_transport")
        confidence -= 10
    if row.get("buy_city") and row["buy_city"] != row["refine_city"]:
        risk_flags.append("input_transport")
        confidence -= 10

    if row["price_source"] == "sell_min":
        risk_flags.append("missing_history_price")
        confidence -= 10

    confidence = max(0, min(100, confidence))
    focus_crafts = focus_budget // row["focus_cost"] if row["use_focus"] and row["focus_cost"] > 0 else 0
    silver_crafts = (
        investment_budget // row["total_cost_conservative"]
        if investment_budget > 0 and row["total_cost_conservative"] > 0
        else 1
    )
    sellable = row["avg_daily_vol"] if row["avg_daily_vol"] > 0 else 0
    if row["use_focus"]:
        budget_crafts = max(0, min(focus_crafts, silver_crafts))
    else:
        budget_crafts = max(0, silver_crafts)
    daily_crafts = max(0, min(budget_crafts, sellable)) if sellable > 0 else 0
    risk_multiplier = 0.45 + (confidence / 100) * 0.55

    row["confidence_score"] = confidence
    row["risk_flags"] = risk_flags
    row["risk_label"] = "low" if confidence >= 75 else "medium" if confidence >= 50 else "high"
    row["sellable_crafts_estimate"] = sellable
    row["daily_crafts_estimate"] = daily_crafts
    row["budget_crafts_estimate"] = budget_crafts
    row["silver_budget_crafts_estimate"] = silver_crafts
    row["focus_budget_crafts_estimate"] = focus_crafts
    row["profit_per_run"] = row["profit"]
    row["profit_per_run_conservative"] = row["profit_conservative"]
    row["profit_for_focus_budget"] = row["profit_conservative"] * focus_crafts if row["use_focus"] else 0
    row["profit_for_investment_budget"] = row["profit_conservative"] * budget_crafts
    row["investment_required"] = row["total_cost_conservative"] * budget_crafts
    row["net_revenue_for_budget"] = row["net_revenue_conservative"] * budget_crafts
    row["roi_pct"] = (
        round(row["profit_for_investment_budget"] / row["investment_required"] * 100, 1)
        if row["investment_required"] > 0
        else 0
    )
    row["raw_daily_profit"] = row["profit_conservative"] * daily_crafts
    row["risk_adjusted_daily_profit"] = round(row["raw_daily_profit"] * risk_multiplier)
    return row


def data_freshness_dot(ts: str) -> str:
    if not ts:
        return '<span style="color:#5a6472;cursor:help" title="Neznámé stáří">●</span>'
    try:
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        now = datetime.now(timezone.utc)
        age_h = (now - dt).total_seconds() / 3600
    except Exception:
        return '<span style="color:#5a6472">●</span>'
    if age_h < 1:
        color, label = "#3fa865", f"<1h stará (čerstvé)"
    elif age_h < 6:
        color, label = "#e6c84a", f"{age_h:.0f}h stará (OK)"
    elif age_h < 24:
        color, label = "#e2884a", f"{age_h:.0f}h stará (starší)"
    else:
        color, label = "#e25a5a", f"{age_h:.0f}h stará (zastaralé)"
    return f'<span style="color:{color};cursor:help" title="{label}">●</span>'


def fmt_k(val: int) -> str:
    if val >= 1_000_000:
        return f"{val/1_000_000:.1f}M"
    if val >= 1_000:
        return f"{val/1_000:.1f}k"
    return str(val)


def calc_price_trend(hist_data: list):
    """Vrátí (direction, pct) kde direction je 'up'/'down'/'flat'."""
    if not hist_data or len(hist_data) < 3:
        return 'flat', 0.0
    prices = [p["avg_price"] for p in hist_data if p.get("avg_price", 0) > 0]
    if len(prices) < 3:
        return 'flat', 0.0
    mid = len(prices) // 2
    early  = sum(prices[:mid]) / mid
    recent = sum(prices[mid:]) / (len(prices) - mid)
    if early == 0:
        return 'flat', 0.0
    pct = (recent - early) / early * 100
    if pct > 5:
        return 'up', pct
    elif pct < -5:
        return 'down', pct
    return 'flat', pct


def trend_arrow(hist_data: list) -> str:
    d, pct = calc_price_trend(hist_data)
    if d == 'up':
        return f'<span style="color:#3fa865;font-weight:700;cursor:help" title="7d trend: +{pct:.0f}%">↑</span>'
    if d == 'down':
        return f'<span style="color:#e25a5a;font-weight:700;cursor:help" title="7d trend: {pct:.0f}%">↓</span>'
    return f'<span style="color:#8a9199;cursor:help" title="7d trend: {pct:+.0f}%">→</span>'


# ============================================================
# HLAVNÍ VÝPOČET
# ============================================================

def analyze_refining(
    tiers: list,
    focus_budget: int,
    history_days: int = 7,
    activity_bonus_categories=None,
    material: str | None = None,
    investment_budget: int = 1_000_000,
    buy_city: str = "auto",
    refine_city: str = "auto",
    sell_city: str = "auto",
):
    """
    Pro každý (materiál × tier × refine_city × sell_city) spočítá profit.
    Vrátí list dict s výsledky.
    """

    material_types = [material] if material in REFINE_MATERIALS else list(REFINE_MATERIALS)

    # Posbírej jen item_ids pro vybraný materiál, ať klik na Ore netahá ceny
    # pro celé refining universum.
    refined_ids = []
    raw_ids     = []
    for mat_type in material_types:
        raw_key = REFINE_MATERIALS[mat_type]["raw"]
        for tier in tiers:
            refined_ids.append(f"T{tier}_{mat_type}")
            raw_ids.append(f"T{tier}_{raw_key}")
            if tier >= 3:
                lower_refined = f"T{tier - 1}_{mat_type}"
                if lower_refined not in refined_ids:
                    refined_ids.append(lower_refined)

    all_item_ids = list(set(refined_ids + raw_ids))

    print(f"[1/3] Stahuji ceny pro {len(all_item_ids)} itemů...")
    prices = fetch_prices(all_item_ids, ALL_CITIES)
    print(f"      Získáno {len(prices)} cenových záznamů")

    if not prices:
        print("[!] Žádné ceny z AODP — zkus otevřít itemy v Albionu.")
        return []

    print(f"[2/3] Stahuji {history_days}-denní historii...")
    history = fetch_history(all_item_ids, ALL_CITIES, days=history_days)
    print(f"      Historie: {len(history)} kombinací")

    print("[3/3] Počítám marže...")
    results = []

    for mat_type in material_types:
        mat_info = REFINE_MATERIALS[mat_type]
        bonus_city = next(city for city, mat in REFINE_BONUSES.items() if mat == mat_type)

        for tier in tiers:
            refined_id = f"T{tier}_{mat_type}"
            recipe     = build_refine_recipe(mat_type, tier)
            focus_cost = REFINE_FOCUS.get(tier, 60)

            refine_cities = [bonus_city] if refine_city == "auto" else [refine_city]
            buy_cities = ALL_CITIES if buy_city == "auto" else [buy_city]
            sell_cities = ALL_CITIES if sell_city == "auto" else [sell_city]

            for current_refine_city in refine_cities:
                for current_buy_city in buy_cities:
                    # Nákup držíme v jednom městě, aby hráč dostal jasnou trasu
                    # bez skládání receptu z několika vzdálených marketů.
                    has_inputs = True
                    nominal_cost = 0
                    nominal_cost_conservative = 0
                    input_weight_kg = 0.0
                    input_breakdown = []
                    for input_id, qty in recipe:
                        key = (input_id, current_buy_city)
                        if key not in prices or prices[key]["sell_min"] == 0:
                            has_inputs = False
                            break
                        unit_price = prices[key]["sell_min"]
                        hist_unit = _median_price(history.get(key, []))
                        conservative_unit = max(unit_price, hist_unit) if hist_unit > 0 else unit_price
                        subtotal   = unit_price * qty
                        subtotal_conservative = conservative_unit * qty
                        input_weight_kg += _item_weight_kg(input_id) * qty
                        nominal_cost += subtotal
                        nominal_cost_conservative += subtotal_conservative
                        input_breakdown.append({
                            "item_id": input_id,
                            "qty": qty,
                            "buy_city": current_buy_city,
                            "price": unit_price,
                            "price_conservative": conservative_unit,
                            "subtotal": subtotal,
                            "subtotal_conservative": subtotal_conservative,
                            "updated": prices[key]["updated"],
                        })
                    if not has_inputs or nominal_cost == 0:
                        continue

                    # Return rate (vrácení části surovin s focusem)
                    has_bonus = (REFINE_BONUSES.get(current_refine_city) == mat_type)
                    has_activity_bonus = _activity_bonus_applies_to_refining(
                        mat_type,
                        activity_bonus_categories,
                    )
                    activity_rr_bonus = (
                        ACTIVITY_RETURN_RATE_BONUS if has_activity_bonus else 0.0
                    )
                    use_focus = focus_budget > 0
                    if use_focus:
                        rr = RR_FOCUS_BONUS if has_bonus else RR_FOCUS_BASE
                    else:
                        rr = RR_NO_FOCUS_BONUS if has_bonus else RR_NO_FOCUS_BASE
                    rr = _clamp_return_rate(rr + activity_rr_bonus)
                    eff_cost = round(nominal_cost * (1 - rr))
                    eff_cost_conservative = round(nominal_cost_conservative * (1 - rr))
                    station_fee = round(nominal_cost * REFINE_STATION_FEE_RATE)
                    station_fee_conservative = round(nominal_cost_conservative * REFINE_STATION_FEE_RATE)
                    input_transport_fee = _transport_fee_for_weight(
                        current_buy_city,
                        current_refine_city,
                        input_weight_kg,
                    )

                    # Pro každé sell city spočítej profit
                    for current_sell_city in sell_cities:
                        sell_key = (refined_id, current_sell_city)
                        if sell_key not in prices:
                            continue
                        sell_min = prices[sell_key]["sell_min"]
                        if sell_min == 0:
                            continue

                        # Použij medián z historie pokud dostupný
                        hist_key  = (refined_id, current_sell_city)
                        hist_data = history.get(hist_key, [])
                        hist_median = _median_price(hist_data)
                        if hist_data:
                            daily_prices = sorted(p["avg_price"] for p in hist_data if p["avg_price"] > 0)
                            if daily_prices:
                                mid = len(daily_prices) // 2
                                sell_price = round(
                                    (daily_prices[mid - 1] + daily_prices[mid]) / 2
                                    if len(daily_prices) % 2 == 0
                                    else daily_prices[mid]
                                )
                                price_source = "median7d"
                            else:
                                sell_price = sell_min
                                price_source = "sell_min"
                        else:
                            sell_price = sell_min
                            price_source = "sell_min"

                        sell_price_conservative = min(sell_min, hist_median) if hist_median > 0 else sell_min
                        net_revenue = round(sell_price * (1 - MARKET_TAX))
                        net_revenue_conservative = round(sell_price_conservative * (1 - MARKET_TAX))

                        output_transport_fee = _transport_fee_for_weight(
                            current_refine_city,
                            current_sell_city,
                            REFINED_WEIGHT_KG,
                        )
                        transport_fee = input_transport_fee + output_transport_fee
                        transport_label = (
                            "Stejné město"
                            if transport_fee == 0
                            else "Fast travel estimate"
                        )

                        total_cost = eff_cost + station_fee + transport_fee
                        total_cost_conservative = eff_cost_conservative + station_fee_conservative + transport_fee
                        profit = net_revenue - total_cost
                        profit_conservative = net_revenue_conservative - total_cost_conservative
                        silver_per_focus = round(profit / focus_cost, 1) if focus_cost > 0 and use_focus else 0
                        silver_per_focus_conservative = (
                            round(profit_conservative / focus_cost, 1) if focus_cost > 0 and use_focus else 0
                        )

                        # Volume z historie
                        avg_vol = _avg_daily_volume(hist_data)

                        results.append({
                        "mat_type":       mat_type,
                        "mat_label":      mat_info["label"],
                        "mat_emoji":      mat_info["emoji"],
                        "mat_color":      mat_info["color"],
                        "tier":           tier,
                        "refined_id":     refined_id,
                        "buy_city":       current_buy_city,
                        "refine_city":    current_refine_city,
                        "sell_city":      current_sell_city,
                        "has_bonus":      has_bonus,
                        "has_activity_bonus": has_activity_bonus,
                        "activity_bonus_rr_pct": round(activity_rr_bonus * 100, 1),
                        "bonus_city":     bonus_city,
                        "nominal_cost":   nominal_cost,
                        "nominal_cost_conservative": nominal_cost_conservative,
                        "eff_cost":       eff_cost,
                        "eff_cost_conservative": eff_cost_conservative,
                        "station_fee":    station_fee,
                        "station_fee_conservative": station_fee_conservative,
                        "total_cost":     total_cost,
                        "total_cost_conservative": total_cost_conservative,
                        "rr_pct":         round(rr * 100, 1),
                        "use_focus":      use_focus,
                        "sell_price":     sell_price,
                        "sell_price_conservative": sell_price_conservative,
                        "sell_min":       sell_min,
                        "price_source":   price_source,
                        "net_revenue":    net_revenue,
                        "net_revenue_conservative": net_revenue_conservative,
                        "profit":         profit,
                        "profit_conservative": profit_conservative,
                        "margin_pct":     round(profit / total_cost * 100, 1) if total_cost > 0 else 0,
                        "margin_pct_conservative": (
                            round(profit_conservative / total_cost_conservative * 100, 1)
                            if total_cost_conservative > 0
                            else 0
                        ),
                        "focus_cost":     focus_cost,
                        "silver_per_focus": silver_per_focus,
                        "silver_per_focus_conservative": silver_per_focus_conservative,
                        "input_transport_fee": input_transport_fee,
                        "output_transport_fee": output_transport_fee,
                        "transport_fee":  transport_fee,
                        "transport_label": transport_label,
                        "avg_daily_vol":  avg_vol,
                        "history":        hist_data,
                        "input_breakdown": input_breakdown,
                        "sell_updated":   prices.get((refined_id, current_sell_city), {}).get("updated", ""),
                    })
                        results[-1] = _risk_adjusted(results[-1], focus_budget, investment_budget)

    results.sort(
        key=lambda row: (
            row.get("profit_for_investment_budget", 0),
            row.get("silver_per_focus_conservative", 0),
            row.get("risk_adjusted_daily_profit", 0),
        ) if row.get("use_focus") else (
            row.get("profit_conservative", 0),
            row.get("margin_pct_conservative", 0),
            row.get("risk_adjusted_daily_profit", 0),
        ),
        reverse=True,
    )
    return results


# ============================================================
# HTML REPORT
# ============================================================

HTML_STYLE = """
* { box-sizing: border-box; }
body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #0f1419; color: #e6e6e6; margin: 0; padding: 24px; line-height: 1.5;
}
.container { max-width: 1200px; margin: 0 auto; }
h1 { font-size: 28px; margin: 0 0 8px 0; color: #fff; }
.subtitle { color: #8a9199; margin-bottom: 24px; }
.subtitle b { color: #e6e6e6; }
h2 { font-size: 20px; margin: 32px 0 12px 0; color: #fff;
     border-bottom: 2px solid #2a3441; padding-bottom: 8px; }
.hero { background: linear-gradient(135deg, #1a3a5f, #2d5a7a); border-radius: 16px;
        padding: 28px 32px; margin-bottom: 32px; border: 2px solid #3a6a9a; }
.hero-label { font-size: 13px; text-transform: uppercase; letter-spacing: 2px;
              color: #b8d8e8; margin-bottom: 6px; }
.hero-number { font-size: 48px; font-weight: 800; color: #fff; line-height: 1; }
.hero-details { font-size: 13px; color: #b8d8e8; margin-top: 6px; }

/* City bonus reference */
.bonus-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-bottom: 32px; }
.bonus-card { background: #1a2029; border-radius: 10px; padding: 14px 16px; border-top: 3px solid; }
.bonus-city { font-size: 13px; font-weight: 700; color: #fff; margin-bottom: 4px; }
.bonus-mat  { font-size: 12px; color: #8a9199; }
.bonus-mat b { color: #e6e6e6; }

/* Result table */
.result-table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 32px; }
.result-table th { text-align: left; padding: 8px 12px; color: #5a6472; font-size: 11px;
                   text-transform: uppercase; border-bottom: 2px solid #2a3441; }
.result-table td { padding: 8px 12px; border-bottom: 1px solid #1e2530; vertical-align: middle; }
.result-table tr:hover td { background: #1e2530; }
.result-table tr.bonus-row td { background: linear-gradient(90deg, #1a2e1f22, transparent); }
.t-tier { color: #8a9199; font-size: 12px; font-weight: 700; }
.t-name { color: #e6e6e6; font-weight: 600; }
.t-city { color: #8a9199; font-size: 12px; }
.t-city b { color: #e6c84a; }
.t-cost { color: #4a9ee2; }
.t-sell { color: #c8cdd4; }
.t-profit { color: #3fa865; font-weight: 700; }
.t-profit.negative { color: #e25a5a; }
.t-margin { font-size: 12px; }
.t-vol { color: #8a9199; font-size: 12px; }
.t-spf { color: #a070d0; font-weight: 600; }
.bonus-badge { background: #1a3a20; color: #3fa865; padding: 2px 7px; border-radius: 10px;
               font-size: 11px; font-weight: 600; margin-left: 6px; }
.no-bonus { background: #2a2f38; color: #8a9199; padding: 2px 7px; border-radius: 10px;
            font-size: 11px; margin-left: 6px; }
.num { text-align: right; font-variant-numeric: tabular-nums; }

/* Breakdown */
.breakdown { font-size: 12px; color: #8a9199; margin-top: 4px; }
.breakdown code { background: #1e2530; padding: 1px 4px; border-radius: 3px; color: #8ab4d8; }
"""


def write_html_report(path: Path, results: list, tiers: list, focus_budget: int, today: str):
    # Filtruj jen best sell city per (mat, tier, refine_city)
    from collections import defaultdict
    grouped = defaultdict(list)
    for r in results:
        key = (r["mat_type"], r["tier"], r["refine_city"])
        grouped[key].append(r)

    best_rows = []
    for key, variants in grouped.items():
        best = max(variants, key=lambda x: x["profit"])
        best["alternatives_sell"] = [v for v in variants if v["sell_city"] != best["sell_city"]]
        best_rows.append(best)

    # Seřaď dle silver_per_focus
    best_rows.sort(key=lambda r: r["silver_per_focus"], reverse=True)

    # Top profit row
    top = best_rows[0] if best_rows else None
    hero_profit = 0
    hero_detail = ""
    if top:
        crafts_budget = focus_budget // top["focus_cost"] if top["focus_cost"] > 0 else 0
        hero_profit   = crafts_budget * top["profit"]
        hero_detail   = (f"{top['mat_emoji']} {top['mat_label']} T{top['tier']} · "
                         f"Refine v <b>{top['refine_city']}</b>"
                         f"{'  ✓ bonus' if top['has_bonus'] else ''} · "
                         f"Prodej v <b>{top['sell_city']}</b> · "
                         f"{crafts_budget}× craftů za {focus_budget:,} focus")

    # City bonus reference grid
    bonus_colors = {
        "Thetford":      "#a0b4c8",
        "Fort Sterling": "#c8a060",
        "Martlock":      "#c87840",
        "Lymhurst":      "#a070d0",
    }
    bonus_grid_html = ""
    for city, mat in REFINE_BONUSES.items():
        if mat is None:
            continue
        mat_info = REFINE_MATERIALS.get(mat, {})
        color = bonus_colors.get(city, "#5a6472")
        bonus_grid_html += f"""
        <div class="bonus-card" style="border-top-color:{color}">
            <div class="bonus-city">{city}</div>
            <div class="bonus-mat">{mat_info.get('emoji','')} <b>{mat_info.get('label','')}</b>
                ({mat_info.get('raw','')} → {mat})</div>
            <div class="bonus-mat" style="margin-top:4px;color:{color}">
                RR s focusem: <b>{round(RR_FOCUS_BONUS*100,1)}%</b>
                <span style="color:#5a6472">(vs {round(RR_FOCUS_BASE*100,1)}% bez bonusu)</span>
            </div>
        </div>"""

    # Hlavní tabulka
    table_rows_html = ""
    for r in best_rows:
        profit_class = "negative" if r["profit"] < 0 else ""
        bonus_badge  = '<span class="bonus-badge">⭐ bonus</span>' if r["has_bonus"] else '<span class="no-bonus">bez bonusu</span>'
        trend        = trend_arrow(r["history"])
        fresh        = data_freshness_dot(r["sell_updated"])

        # Breakdown surovin
        breakdown_parts = " + ".join(
            f"<code>{inp['item_id']}</code> {inp['qty']}× @ {inp['price']:,}"
            for inp in r["input_breakdown"]
        )
        breakdown_html = f'<div class="breakdown">{breakdown_parts} = {r["nominal_cost"]:,} nom. → {r["eff_cost"]:,} eff. (RR {r["rr_pct"]}%)</div>'

        # Alternativní sell cities
        alt_sells = ""
        for alt in sorted(r.get("alternatives_sell", []), key=lambda x: x["profit"], reverse=True)[:3]:
            alt_sells += (f'<span style="color:#5a6472;font-size:11px;margin-left:8px">'
                          f'{alt["sell_city"]}: {alt["profit"]:,}</span>')

        row_class = "bonus-row" if r["has_bonus"] else ""
        table_rows_html += f"""
        <tr class="{row_class}">
            <td><span class="t-tier">T{r['tier']}</span></td>
            <td>
                <span class="t-name">{r['mat_emoji']} {r['mat_label']}</span>
                {bonus_badge}
                {breakdown_html}
            </td>
            <td class="t-city">Refine: <b>{r['refine_city']}</b></td>
            <td class="t-sell num">
                {r['sell_price']:,} {fresh}{trend}
                <div style="font-size:11px;color:#5a6472">→ {r['sell_city']}{alt_sells}</div>
            </td>
            <td class="t-cost num">{r['eff_cost']:,}</td>
            <td class="t-profit {profit_class} num">{r['profit']:+,}</td>
            <td class="t-margin num">{r['margin_pct']:+.0f}%</td>
            <td class="t-vol num">{r['avg_daily_vol']}/den</td>
            <td class="t-spf num">{r['silver_per_focus']:.1f}</td>
        </tr>"""

    html = f"""<!DOCTYPE html>
<html lang="cs">
<head>
<meta charset="UTF-8">
<title>Albion Refining Report — {today}</title>
<style>{HTML_STYLE}</style>
</head>
<body>
<div class="container">
    <h1>⚗️ Albion Refining Analyzer</h1>
    <div class="subtitle">
        <b>{today}</b> · tiery: <b>{tiers}</b> · focus budget: <b>{focus_budget:,}</b>/den
    </div>

    <div class="hero">
        <div class="hero-label">💰 Nejlepší příležitost (s focusem)</div>
        <div class="hero-number">+{hero_profit:,}</div>
        <div class="hero-details">{hero_detail}</div>
    </div>

    <h2>🏙️ City bonusy pro refining</h2>
    <div class="bonus-grid">
        {bonus_grid_html}
    </div>

    <h2>📊 Přehled všech příležitostí</h2>
    <table class="result-table">
        <thead>
            <tr>
                <th>Tier</th>
                <th>Materiál + suroviny</th>
                <th>Refine v</th>
                <th class="num">Sell cena</th>
                <th class="num">Eff. náklad</th>
                <th class="num">Profit/ks</th>
                <th class="num">Marže</th>
                <th class="num">Volume</th>
                <th class="num">Silver/focus</th>
            </tr>
        </thead>
        <tbody>
            {table_rows_html}
        </tbody>
    </table>
</div>
</body>
</html>"""

    path.write_text(html, encoding="utf-8")


# ============================================================
# CSV EXPORT
# ============================================================

def write_csv_report(path: Path, results: list):
    if not results:
        return
    fields = [k for k in results[0].keys()
              if k not in ("history", "input_breakdown", "alternatives_sell")]
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=fields, delimiter=";", extrasaction="ignore")
        w.writeheader()
        w.writerows(results)


# ============================================================
# MAIN
# ============================================================

def main():
    parser = argparse.ArgumentParser(description="Albion refining profit analyzer")
    parser.add_argument("--tiers", default="4,5,6",
                        help="Tiery k analýze, čárkou oddělené (default: 4,5,6)")
    parser.add_argument("--focus-budget", type=int, default=10000,
                        help="Denní focus budget (default: 10000)")
    parser.add_argument("--history-days", type=int, default=7,
                        help="Počet dní historie (default: 7)")
    parser.add_argument("--min-volume", type=int, default=5,
                        help="Minimální volume/den pro zobrazení (default: 5)")
    parser.add_argument("--out-dir", default="reports",
                        help="Výstupní složka (default: reports)")
    args = parser.parse_args()

    tiers = [int(t.strip()) for t in args.tiers.split(",")]

    print(f"\n>> Albion Refining Analyzer")
    print(f"   Tiery:        {tiers}")
    print(f"   Focus budget: {args.focus_budget:,}/den")
    print(f"   History days: {args.history_days}")

    results = analyze_refining(tiers, args.focus_budget, history_days=args.history_days)

    if not results:
        print("\n[!] Žádné výsledky.")
        return

    # Filtruj nízký volume
    if args.min_volume > 0:
        before = len(results)
        results = [r for r in results if r["avg_daily_vol"] >= args.min_volume or r["avg_daily_vol"] == 0]
        print(f"      Filtr vol ≥ {args.min_volume}: odstraněno {before - len(results)} řádků")

    today   = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    html_path = out_dir / f"refining_report_{today}.html"
    csv_path  = out_dir / f"refining_report_{today}.csv"

    write_html_report(html_path, results, tiers, args.focus_budget, today)
    write_csv_report(csv_path, results)

    print(f"\n>> Hotovo!")
    print(f"   HTML: {html_path}")
    print(f"   CSV:  {csv_path}")


if __name__ == "__main__":
    main()
