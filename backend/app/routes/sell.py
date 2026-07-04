"""Sell recommendation endpoint."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.schemas.sell import SellRequest, SellResponse
from app.services.sell_service import get_sell_recommendations

router = APIRouter(tags=["sell"])


@router.post(
    "/sell",
    response_model=SellResponse,
    summary="Recommend best royal city to sell inventory items",
)
def sell(req: SellRequest) -> SellResponse:
    """Rank sell cities by net revenue after market tax and transport fee."""
    try:
        result = get_sell_recommendations(
            from_city=req.from_city,
            items=req.items,
            history_days=req.history_days,
            include_black_market=req.include_black_market,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=502,
            detail=f"Sell recommendation failed: {type(exc).__name__}: {exc}",
        ) from exc

    return SellResponse(**result)
