"""City bonus reference — read-only metadata."""

from typing import Dict, List

from pydantic import BaseModel, Field


class CityBonusInfo(BaseModel):
    """Crafting bonus breakdown for a single royal city."""

    name: str = Field(..., description="City name")
    equipment_categories: List[str] = Field(
        default_factory=list,
        description="Item categories with the +37% craft return rate bonus",
    )
    food_categories: List[str] = Field(
        default_factory=list,
        description="Meal categories with the chef's district bonus",
    )
    refining_material: str | None = Field(
        default=None,
        description="Refining bonus material (e.g. METALBAR), null if none",
    )


class CitiesResponse(BaseModel):
    """All royal cities with their bonus profiles."""

    cities: List[CityBonusInfo]
    equipment_bonuses: Dict[str, List[str]] = Field(
        ..., description="Raw CITY_BONUSES mapping (city → categories)"
    )
    food_bonuses: Dict[str, List[str]] = Field(
        ..., description="Raw FOOD_CITY_BONUSES mapping (city → meal categories)"
    )
