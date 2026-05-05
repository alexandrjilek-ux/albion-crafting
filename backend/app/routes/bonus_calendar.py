"""Albion events and production bonus calendar endpoint."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.schemas.bonus_calendar import BonusCalendarResponse
from app.services.bonus_calendar_service import get_bonus_calendar

router = APIRouter(tags=["bonus-calendar"])


@router.get(
    "/bonus-calendar",
    response_model=BonusCalendarResponse,
    summary="Auto-load Albion event and production bonus reference data",
)
def bonus_calendar() -> BonusCalendarResponse:
    """
    Fetch public Albion bonus data and normalize it for the mobile calendar tab.
    """
    try:
        result = get_bonus_calendar()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=502,
            detail=f"Bonus calendar load failed: {type(exc).__name__}: {exc}",
        ) from exc

    return BonusCalendarResponse(**result)
