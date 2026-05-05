"""Static city bonus reference."""

from fastapi import APIRouter

from app.schemas.cities import CitiesResponse
from app.services.cities_service import get_cities_reference

router = APIRouter(tags=["reference"])


@router.get("/cities", response_model=CitiesResponse, summary="City bonus reference")
def list_cities() -> CitiesResponse:
    """
    Returns the static crafting / food / refining bonus tables for all
    royal cities. Useful for the mobile UI to render dropdowns and
    bonus indicators without hardcoding the data.
    """
    return CitiesResponse(**get_cities_reference())
