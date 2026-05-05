"""Transport (fast travel fee) endpoint — simple GET with query params."""

from fastapi import APIRouter, HTTPException, Query

from app.schemas.transport import TransportResponse
from app.services.transport_service import calc_transport

router = APIRouter(tags=["transport"])


@router.get(
    "/transport",
    response_model=TransportResponse,
    summary="Fast-travel fee for moving items between royal cities",
)
def transport(
    from_city: str = Query(..., description="Origin royal city"),
    to_city: str = Query(..., description="Destination royal city"),
    category: str = Query(..., description="Item category (e.g. PLATE_ARMOR, SWORD)"),
    tier: int = Query(..., ge=4, le=8),
    num_items: int = Query(..., ge=1),
    item_value: int = Query(0, ge=0, description="Per-item silver value (unused for fast travel; reserved)"),
) -> TransportResponse:
    """
    Compute fast-travel fee = total weight (kg) × 60 silver/kg.

    Same-city transport is free. Caerleon counts as a royal city
    (fast travel works there normally — only the Outlands portals
    are PvP).
    """
    try:
        result = calc_transport(
            from_city=from_city,
            to_city=to_city,
            category=category,
            tier=tier,
            num_items=num_items,
            item_value=item_value,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return TransportResponse(**result)
