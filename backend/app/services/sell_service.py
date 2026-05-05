"""Sell recommendation service."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Tuple

from app.core.albion_crafting import CITY_BONUSES, MARKET_TAX, fetch_history, fetch_prices
from app.core.transport import calculate_transport
from app.schemas.sell import SellItemInput

ROYAL_CITIES = list(CITY_BONUSES.keys())


def _parse_ts(ts: str):
    if not ts:
        return None
    try:
        normalized = ts[:-1] if ts.endswith("Z") else ts
        dt = datetime.fromisoformat(normalized)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError:
        return None


def _avg_daily_volume(points: List[Dict[str, Any]]) -> int:
    if not points:
        return 0
    return round(sum(int(point.get("item_count", 0) or 0) for point in points) / len(points))


def _confidence(*, avg_daily_volume: int, sell_updated: str, from_city: str, sell_city: str) -> Tuple[int, List[str], str]:
    score = 100
    flags: List[str] = []

    if avg_daily_volume <= 0:
        score -= 30
        flags.append("no_volume_history")
    elif avg_daily_volume < 5:
        score -= 18
        flags.append("thin_market")

    updated_at = _parse_ts(sell_updated)
    if updated_at is None:
        score -= 15
        flags.append("unknown_price_age")
    else:
        age_hours = (datetime.now(timezone.utc) - updated_at).total_seconds() / 3600
        if age_hours > 24:
            score -= 22
            flags.append("stale_price")
        elif age_hours > 6:
            score -= 10
            flags.append("older_price")

    if from_city != sell_city:
        score -= 6
        flags.append("transport_needed")

    if sell_city == "Caerleon":
        # Fast travel do Caerleonu je bezpečný, ale market tam bývá specifičtější.
        flags.append("caerleon_market")

    score = max(0, min(100, score))
    label = "low" if score >= 75 else "medium" if score >= 50 else "high"
    return score, flags, label


def get_sell_recommendations(
    *,
    from_city: str,
    items: List[SellItemInput],
    history_days: int,
) -> Dict[str, Any]:
    """Rank royal cities by net sell revenue after tax and transport fee."""
    if from_city not in ROYAL_CITIES:
        raise ValueError(f"Unknown from_city '{from_city}'. Valid: {ROYAL_CITIES}")

    unique_ids = sorted({item.unique_name for item in items})
    prices = fetch_prices(unique_ids, ROYAL_CITIES, quality=1)
    history = fetch_history(unique_ids, ROYAL_CITIES, days=history_days, quality=1)

    rows = []
    for item in items:
        options = []
        tier = item.tier or _tier_from_unique_name(item.unique_name) or 4
        for city in ROYAL_CITIES:
            price = prices.get((item.unique_name, city), {})
            sell_min = int(price.get("sell_min", 0) or 0)
            if sell_min <= 0:
                continue

            gross = sell_min * item.quantity
            tax = round(gross * MARKET_TAX)
            transport = calculate_transport(
                from_city,
                city,
                item.category,
                tier,
                item.quantity,
                item_value=sell_min,
            )
            transport_fee = int(transport.get("total_cost", 0) or 0)
            avg_vol = _avg_daily_volume(history.get((item.unique_name, city), []))
            score, flags, risk_label = _confidence(
                avg_daily_volume=avg_vol,
                sell_updated=price.get("sell_updated", "") or "",
                from_city=from_city,
                sell_city=city,
            )

            options.append(
                {
                    "city": city,
                    "sell_min": sell_min,
                    "gross_revenue": gross,
                    "market_tax": tax,
                    "transport_fee": transport_fee,
                    "net_revenue": gross - tax - transport_fee,
                    "fee_per_item": int(transport.get("fee_per_item", 0) or 0),
                    "avg_daily_volume": avg_vol,
                    "sell_updated": price.get("sell_updated", "") or "",
                    "confidence_score": score,
                    "risk_label": risk_label,
                    "risk_flags": flags,
                }
            )

        options.sort(key=lambda option: option["net_revenue"], reverse=True)
        best = options[0] if options else None
        rows.append(
            {
                "unique_name": item.unique_name,
                "quantity": item.quantity,
                "category": item.category,
                "tier": item.tier,
                "best_city": best["city"] if best else None,
                "best_net_revenue": best["net_revenue"] if best else 0,
                "best_sell_min": best["sell_min"] if best else 0,
                "options": options,
                "warning": None if best else "No sell_min prices found in royal cities.",
            }
        )

    return {
        "rows": rows,
        "count": len(rows),
        "from_city": from_city,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def _tier_from_unique_name(unique_name: str) -> int | None:
    if len(unique_name) < 2 or unique_name[0] != "T":
        return None
    try:
        return int(unique_name[1])
    except ValueError:
        return None
