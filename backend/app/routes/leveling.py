"""Leveling cost endpoint."""

from fastapi import APIRouter, HTTPException

from app.schemas.leveling import LevelingRequest, LevelingResponse
from app.services.leveling_service import get_leveling_paths

router = APIRouter(tags=["leveling"])


@router.post(
    "/leveling-cost",
    response_model=LevelingResponse,
    summary="T2→T4 Expert leveling cost (silver loss per fame point)",
)
def leveling(req: LevelingRequest) -> LevelingResponse:
    """
    For each leveling-suitable item, walks the T2→T3→T4→T4 Expert
    crafting path and computes total silver loss + fame gained.

    Returns rows sorted by silver-per-fame ascending — lower means
    cheaper per fame point, i.e. the smarter leveling choice.
    """
    try:
        result = get_leveling_paths(city=req.city, use_journal=req.use_journal)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=502,
            detail=f"Leveling analysis failed: {type(exc).__name__}: {exc}",
        ) from exc

    return LevelingResponse(**result)
