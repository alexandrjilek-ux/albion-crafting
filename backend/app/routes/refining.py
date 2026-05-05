"""Refining profit endpoint."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.schemas.refining import RefiningRequest, RefiningResponse
from app.services.refining_service import get_refining_opportunities

router = APIRouter(tags=["refining"])


@router.post(
    "/refining",
    response_model=RefiningResponse,
    summary="Refining (ore/bar, wood/planks, hide/leather, fiber/cloth, rock/stone) profit",
)
def refining(req: RefiningRequest) -> RefiningResponse:
    """
    For each (material × tier × refining city × sell city) combination,
    compute profit + silver-per-focus, taking refining return rate
    bonuses (Thetford=Bar, Fort Sterling=Planks, Martlock=Leather,
    Lymhurst=Cloth, Bridgewatch=Stone) into account.
    """
    try:
        result = get_refining_opportunities(
            tiers=req.tiers,
            focus_budget=req.focus_budget,
            history_days=req.history_days,
            min_volume=req.min_volume,
            bonus_only=req.bonus_only,
            activity_bonus_categories=req.activity_bonus_categories,
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=502,
            detail=f"Refining analysis failed: {type(exc).__name__}: {exc}",
        ) from exc

    return RefiningResponse(**result)
