"""Single-item detail (recipe + prices + history)."""

import traceback

from fastapi import APIRouter, HTTPException, Query

from app.schemas.item_detail import ItemDetailResponse
from app.services.item_detail_service import get_item_detail

# POZN: nepoužívám prefix="/items", protože by to kolidovalo s items router
# (POST /items/top). Necháme každý route mít svůj plný path. FastAPI route
# routing umí mít obě naráz, ale pokud bych dal stejný prefix, museli bychom
# řešit pořadí includes.
router = APIRouter(tags=["items"])


@router.get(
    "/items/{unique_name}",
    response_model=ItemDetailResponse,
    summary="Detail jednoho itemu — recipe, ceny, history",
)
def item_detail(
    unique_name: str,
    history_days: int = Query(default=14, ge=1, le=30),
    quality: int = Query(default=1, ge=1, le=5),
) -> ItemDetailResponse:
    """
    Vrátí kompletní detail pro jeden item:
    - meta (name, tier, category, icon URL)
    - recipe (suroviny + množství + focus/fee)
    - aktuální ceny (sell_min, buy_max) ve všech royal cities
    - ceny surovin per city
    - price history (default 14 dní, denní agregát)

    `unique_name` může být s enchantem: `T6_ARMOR_PLATE_SET1@2`.
    """
    try:
        result = get_item_detail(
            unique_name=unique_name,
            history_days=history_days,
            quality=quality,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        print(f"\n[!!!] /items/{unique_name} exception traceback:")
        traceback.print_exc()
        raise HTTPException(
            status_code=502,
            detail=f"Item detail failed: {type(exc).__name__}: {exc}",
        ) from exc

    return ItemDetailResponse(**result)
