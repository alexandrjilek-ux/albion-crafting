"""
Thin orchestration around `albion_crafting.run_analysis()`.

Encapsulates the "auto city" comparison loop that previously lived in
`app.py` (Streamlit). Returns plain dict rows — the routing layer wraps
them into Pydantic responses.
"""

from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional, Tuple

from app.core.albion_crafting import (
    CITY_BONUSES,
    FOOD_CITY_BONUSES,
    _ranking_value,
    run_analysis,
)

# Type alias — progress_callback dostane (label, current_step, total_steps).
# label = lidsky čitelný popis ("Stahuji Bridgewatch"), step/total = 1-based.
ProgressCb = Optional[Callable[[str, int, int], None]]

AUTO_CITY = "auto"
ROYAL_CITIES = [c for c in CITY_BONUSES.keys() if c != "Caerleon"]
FAST_HISTORY_CANDIDATE_LIMIT = 60


def _run_auto(
    *,
    tiers: List[int],
    top: int,
    sort_by: str,
    focus_budget: int,
    bonus_only: bool,
    min_volume: int,
    enchants: List[int],
    no_caerleon: bool,
    spec_level: int,
    station_fee: float,
    mode: str,
    use_focus: bool,
    market_mode: str | None,
    activity_bonus_categories: List[str],
    progress_callback: ProgressCb = None,
) -> Tuple[List[Dict[str, Any]], Optional[str]]:
    """
    Run analysis across all royal cities, pick best craft city per item.

    Returns (top_rows, warning_or_none). Mirrors `run_analysis_auto` from
    the original Streamlit app but without the HTML report generation.
    """
    if not use_focus and sort_by == "silver_per_focus":
        sort_by = "profit_no_focus"

    best_key = "profit_focus_conservative" if use_focus else "profit_no_focus_conservative"
    city_scan_limit = max(top * 2, FAST_HISTORY_CANDIDATE_LIMIT)
    all_best: Dict[str, Dict[str, Any]] = {}
    last_error: Optional[str] = None
    failed_cities: List[str] = []
    volume_fallback_warning: Optional[str] = None

    # Food má aktuálně reálný crafting bonus v Caerleonu; `no_caerleon` řeší
    # sell city risk, ne craft city. Proto ho z auto craft-city scanu nevyhazujeme.
    craft_cities = list(FOOD_CITY_BONUSES.keys()) if mode == "food" else ROYAL_CITIES
    total = len(craft_cities)
    for idx, city in enumerate(craft_cities, start=1):
        if progress_callback:
            # Called BEFORE the heavy work — frontend tak ukáže "Stahuji X" hned,
            # ne až poté co job skončil.
            progress_callback(f"Stahuji {city}", idx, total)
        try:
            _, rows = run_analysis(
                city=city,
                tiers=tiers,
                top=city_scan_limit,
                sort_by=sort_by,
                focus_budget=focus_budget,
                bonus_only=bonus_only,
                min_volume=min_volume,
                history_days=7,
                enchants=enchants,
                no_caerleon=no_caerleon,
                spec_level=spec_level,
                station_fee=station_fee,
                out_dir=None,
                progress_callback=None,
                mode=mode,
                use_focus=use_focus,
                market_mode=market_mode,
                history_candidate_limit=FAST_HISTORY_CANDIDATE_LIMIT,
                activity_bonus_categories=activity_bonus_categories,
            )
            for row in rows:
                item_id = row["item_id"]
                row_score = row.get(best_key, row.get("profit_focus", 0))
                current_score = all_best.get(item_id, {}).get(
                    best_key,
                    all_best.get(item_id, {}).get("profit_focus", 0),
                )
                if item_id not in all_best or row_score > current_score:
                    row["best_craft_city"] = city
                    all_best[item_id] = row
        except Exception as exc:  # noqa: BLE001 — per-city resilience
            last_error = f"{city}: {type(exc).__name__}: {exc}"
            failed_cities.append(city)
            continue

    if not all_best and min_volume > 0:
        # Volume filtr je UX filtr, ne duvod shodit celou analyzu jako backend error.
        # Fallback nesmi jit na 0: i base item bez prodeju je jen papirny
        # profit. Radsi ukazeme ridky trh (1/den) s warningem nez no-sales.
        fallback_min_volume = 1
        volume_fallback_warning = (
            f"Min volume {min_volume}/den nenasel zadne vysledky; "
            f"zobrazuji fallback min volume {fallback_min_volume}/den."
        )
        last_error = None
        failed_cities = []
        for idx, city in enumerate(craft_cities, start=1):
            if progress_callback:
                progress_callback(f"Stahuji {city}", idx, total)
            try:
                _, rows = run_analysis(
                    city=city,
                    tiers=tiers,
                    top=city_scan_limit,
                    sort_by=sort_by,
                    focus_budget=focus_budget,
                    bonus_only=bonus_only,
                    min_volume=fallback_min_volume,
                    history_days=7,
                    enchants=enchants,
                    no_caerleon=no_caerleon,
                    spec_level=spec_level,
                    station_fee=station_fee,
                    out_dir=None,
                    progress_callback=None,
                    mode=mode,
                    use_focus=use_focus,
                    market_mode=market_mode,
                    history_candidate_limit=FAST_HISTORY_CANDIDATE_LIMIT,
                    activity_bonus_categories=activity_bonus_categories,
                )
                for row in rows:
                    item_id = row["item_id"]
                    row_score = row.get(best_key, row.get("profit_focus", 0))
                    current_score = all_best.get(item_id, {}).get(
                        best_key,
                        all_best.get(item_id, {}).get("profit_focus", 0),
                    )
                    if item_id not in all_best or row_score > current_score:
                        row["best_craft_city"] = city
                        all_best[item_id] = row
            except Exception as exc:  # noqa: BLE001
                last_error = f"{city}: {type(exc).__name__}: {exc}"
                failed_cities.append(city)
                continue

    if not all_best:
        mode_label = "meals" if mode == "food" else "items"
        hint = f" (last error: {last_error})" if last_error else ""
        raise ValueError(
            f"No results for {mode_label} T{tiers}.{hint} "
            "AODP may have no recent data — visit the marketplace in-game and retry."
        )

    top_rows = sorted(
        all_best.values(),
        key=lambda r: _ranking_value(r, sort_by, use_focus),
        reverse=True,
    )[:top]
    for r in top_rows:
        if use_focus and focus_budget > 0:
            crafts = focus_budget // r["focus_cost"] if r["focus_cost"] > 0 else 0
            r["_daily_profit_raw"] = crafts * r["profit_focus"]
            r["_daily_profit"] = r.get("risk_adjusted_daily_profit", crafts * r.get("profit_focus_conservative", r["profit_focus"]))
        else:
            r["_daily_profit_raw"] = r["profit_no_focus"]
            r["_daily_profit"] = r.get("risk_adjusted_daily_profit", r.get("profit_no_focus_conservative", r["profit_no_focus"]))
    top_rows.sort(key=lambda r: _ranking_value(r, sort_by, use_focus), reverse=True)

    warning_parts: List[str] = []
    if volume_fallback_warning:
        warning_parts.append(volume_fallback_warning)
    if failed_cities:
        warning_parts.append(f"Partial result - these cities failed: {', '.join(failed_cities)}")
    warning = " ".join(warning_parts) if warning_parts else None
    return top_rows, warning


def get_top_items(
    *,
    city: str,
    tiers: List[int],
    enchants: List[int],
    mode: str,
    use_focus: bool,
    focus_budget: int,
    top: int,
    sort_by: str,
    min_volume: int,
    history_days: int,
    spec_level: int,
    station_fee: float,
    bonus_only: bool,
    no_caerleon: bool,
    market_mode: str | None = None,
    activity_bonus_categories: List[str],
    progress_callback: ProgressCb = None,
) -> Dict[str, Any]:
    """
    Public service function used by the /items/top route.

    Returns a dict with rows + metadata; no HTML.
    """
    # Validate city against the right bonus map for the mode
    valid_cities = list(FOOD_CITY_BONUSES.keys()) if mode == "food" else list(CITY_BONUSES.keys())
    if city != AUTO_CITY and city not in valid_cities:
        raise ValueError(
            f"Unknown city '{city}' for mode='{mode}'. "
            f"Valid: {valid_cities + [AUTO_CITY]}"
        )

    # Food never uses enchants
    if mode == "food":
        enchants = [0]

    warning: Optional[str] = None
    if city == AUTO_CITY:
        rows, warning = _run_auto(
            tiers=tiers,
            top=top,
            sort_by=sort_by,
            focus_budget=focus_budget,
            bonus_only=bonus_only,
            min_volume=min_volume,
            enchants=enchants,
            no_caerleon=no_caerleon,
            spec_level=spec_level,
            station_fee=station_fee,
            mode=mode,
            use_focus=use_focus,
            market_mode=market_mode,
            activity_bonus_categories=activity_bonus_categories,
            progress_callback=progress_callback,
        )
        craft_city_label = "Více měst"
    else:
        if progress_callback:
            # Single-city run je ~6 s, jeden krok. Frontend stejně ukáže
            # "Stahuji <city>".
            progress_callback(f"Stahuji {city}", 1, 1)
        _, rows = run_analysis(
            city=city,
            tiers=tiers,
            top=top,
            sort_by=sort_by,
            focus_budget=focus_budget,
            bonus_only=bonus_only,
            min_volume=min_volume,
            history_days=history_days,
            enchants=enchants,
            no_caerleon=no_caerleon,
            spec_level=spec_level,
            station_fee=station_fee,
            out_dir=None,
            progress_callback=None,
            mode=mode,
            use_focus=use_focus,
            market_mode=market_mode,
            history_candidate_limit=max(top * 3, FAST_HISTORY_CANDIDATE_LIMIT),
            activity_bonus_categories=activity_bonus_categories,
        )
        craft_city_label = city

    return {
        "rows": rows,
        "count": len(rows),
        "mode": mode,
        "craft_city": craft_city_label,
        "sort_by": sort_by,
        "use_focus": use_focus,
        "focus_budget": focus_budget,
        "tiers": tiers,
        "market_mode": market_mode,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "warning": warning,
    }
