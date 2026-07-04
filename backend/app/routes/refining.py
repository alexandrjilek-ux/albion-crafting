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
    Lymhurst=Cloth, Bridgewatch=Stone) into account. In the mobile planning
    default, auto sell city means selling locally in the refining city.
    """
    try:
        result = get_refining_opportunities(
            tiers=req.tiers,
            focus_budget=req.focus_budget,
            investment_budget=req.investment_budget,
            material=req.material,
            buy_city=req.buy_city,
            refine_city=req.refine_city,
            sell_city=req.sell_city,
            history_days=req.history_days,
            price_mode=req.price_mode,
            usage_fee_pct=req.usage_fee_pct,
            market_tax_pct=req.market_tax_pct,
            return_rate_preset=req.return_rate_preset,
            custom_return_rate_pct=req.custom_return_rate_pct,
            min_volume=req.min_volume,
            bonus_only=req.bonus_only,
            profitable_only=req.profitable_only,
            max_stale_hours=req.max_stale_hours,
            activity_bonus_categories=req.activity_bonus_categories,
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=502,
            detail=f"Refining analysis failed: {type(exc).__name__}: {exc}",
        ) from exc

    return RefiningResponse(**result)
