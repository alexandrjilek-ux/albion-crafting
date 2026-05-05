"""Wrapper around `refining_report.analyze_refining`."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List

from app.core.refining_report import analyze_refining


def get_refining_opportunities(
    *,
    tiers: List[int],
    focus_budget: int,
    history_days: int,
    min_volume: int,
    bonus_only: bool,
    activity_bonus_categories: List[str],
) -> Dict[str, Any]:
    """Run the refining analyzer and return rows + metadata.

    `analyze_refining` already returns sorted opportunities; we just
    apply the volume filter (the original Streamlit didn't filter on
    volume here but the parameter is exposed for consistency with
    /items/top).
    """
    rows = analyze_refining(
        tiers=tiers,
        focus_budget=focus_budget,
        history_days=history_days,
        activity_bonus_categories=activity_bonus_categories,
    )

    if bonus_only:
        # Refining bonus city je pro suroviny zásadní; mobilní UI potom řeší hlavně
        # kam prodat výstup, ne zda obětovat return rate v jiném městě.
        rows = [r for r in rows if r.get("has_bonus")]

    if min_volume > 0:
        rows = [r for r in rows if r.get("avg_daily_vol", 0) >= min_volume]

    return {
        "rows": rows,
        "count": len(rows),
        "tiers": tiers,
        "focus_budget": focus_budget,
        "bonus_only": bonus_only,
        "activity_bonus_categories": activity_bonus_categories,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
