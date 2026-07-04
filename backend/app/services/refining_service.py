"""Wrapper around `refining_report.analyze_refining`."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List

from app.core.refining_report import analyze_refining


def get_refining_opportunities(
    *,
    tiers: List[int],
    focus_budget: int,
    investment_budget: int,
    material: str | None,
    buy_city: str,
    refine_city: str,
    sell_city: str,
    history_days: int,
    price_mode: str,
    usage_fee_pct: float,
    market_tax_pct: float,
    return_rate_preset: str,
    custom_return_rate_pct: float | None,
    min_volume: int,
    bonus_only: bool,
    profitable_only: bool,
    max_stale_hours: int,
    activity_bonus_categories: List[str],
) -> Dict[str, Any]:
    """Run the refining analyzer and return rows + metadata.

    `analyze_refining` returns the broad matrix; the service shapes it for the
    mobile planner by applying bonus/local-sale/volume filters and budget sort.
    """
    rows = analyze_refining(
        tiers=tiers,
        focus_budget=focus_budget,
        history_days=history_days,
        activity_bonus_categories=activity_bonus_categories,
        material=material,
        investment_budget=investment_budget,
        buy_city=buy_city,
        refine_city=refine_city,
        sell_city=sell_city,
        price_mode=price_mode,
        usage_fee_pct=usage_fee_pct,
        market_tax_pct=market_tax_pct,
        return_rate_preset=return_rate_preset,
        custom_return_rate_pct=custom_return_rate_pct,
    )

    if bonus_only:
        # Refining bonus city je pro suroviny zásadní; mobilní UI potom řeší hlavně
        # kam prodat výstup, ne zda obětovat return rate v jiném městě.
        rows = [r for r in rows if r.get("has_bonus")]

    if sell_city == "auto":
        # V mobilním plánovači je refining city cílová stanice: tam hráč veze vstupy,
        # refiní a prodává výstup. Cross-city prodej necháváme jen pro explicitní filtr.
        rows = [
            r
            for r in rows
            if (
                not r.get("refine_city")
                or not r.get("sell_city")
                or r.get("sell_city") == r.get("refine_city")
            )
        ]

    if min_volume > 0:
        rows = [r for r in rows if r.get("avg_daily_vol", 0) >= min_volume]

    if max_stale_hours > 0:
        rows = [
            r for r in rows
            if _row_price_age_ok(r, max_stale_hours)
        ]

    if profitable_only:
        rows = [r for r in rows if r.get("profit_for_investment_budget", 0) > 0]

    rows.sort(
        key=lambda row: (
            row.get("profit_for_investment_budget", 0),
            row.get("roi_pct", 0),
            row.get("profit_conservative", 0),
        ),
        reverse=True,
    )

    return {
        "rows": rows,
        "count": len(rows),
        "tiers": tiers,
        "focus_budget": focus_budget,
        "investment_budget": investment_budget,
        "material": material,
        "buy_city": buy_city,
        "refine_city": refine_city,
        "sell_city": sell_city,
        "bonus_only": bonus_only,
        "price_mode": price_mode,
        "usage_fee_pct": usage_fee_pct,
        "market_tax_pct": market_tax_pct,
        "return_rate_preset": return_rate_preset,
        "profitable_only": profitable_only,
        "max_stale_hours": max_stale_hours,
        "activity_bonus_categories": activity_bonus_categories,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def _row_price_age_ok(row: Dict[str, Any], max_stale_hours: int) -> bool:
    from app.core.refining_report import _price_age_hours

    sell_age = _price_age_hours(str(row.get("sell_updated", "")))
    if sell_age is None or sell_age > max_stale_hours:
        return False
    for input_row in row.get("input_breakdown", []) or []:
        input_age = _price_age_hours(str(input_row.get("updated", "")))
        if input_age is None or input_age > max_stale_hours:
            return False
    return True
