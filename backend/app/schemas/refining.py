"""Refining endpoint schemas (ore→bar, wood→planks, hide→leather, fiber→cloth)."""

from __future__ import annotations

from typing import Any, Dict, List, Literal

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import CityName

RefiningMaterial = Literal["METALBAR", "PLANKS", "LEATHER", "CLOTH", "STONEBLOCK"]
CityOrAuto = CityName | Literal["auto"]


class RefiningRequest(BaseModel):
    """Request body for POST /refining."""

    tiers: List[int] = Field(
        default_factory=lambda: [4, 5, 6],
        description="Tiers to analyze (typically 2–8)",
    )
    focus_budget: int = Field(
        default=10_000,
        ge=0,
        le=30_000,
        description="Daily focus budget. Use 0 to analyze no-focus refining.",
    )
    investment_budget: int = Field(
        default=1_000_000,
        ge=0,
        le=1_000_000_000,
        description="Silver budget available for buying inputs and paying refining/transport costs.",
    )
    material: RefiningMaterial | None = Field(
        default=None,
        description="Optional refined material to analyze. Null scans all refining materials.",
    )
    buy_city: CityOrAuto = Field(
        default="auto",
        description="Input purchase city. Use auto to compare all royal cities and pick best routes.",
    )
    refine_city: CityOrAuto = Field(
        default="auto",
        description="Refining city. Use auto to select the material's dedicated bonus city.",
    )
    sell_city: CityOrAuto = Field(
        default="auto",
        description="Output sale city. Use auto to compare all royal cities.",
    )
    history_days: int = Field(
        default=7,
        ge=1,
        le=30,
        description="Number of recent daily history points to use for conservative prices and volume.",
    )
    min_volume: int = Field(
        default=0,
        ge=0,
        le=200,
        description="Minimum average daily sold volume. 0 keeps all rows.",
    )
    bonus_only: bool = Field(
        default=True,
        description="When true, keep only rows where the material is refined in its dedicated refining-bonus city.",
    )
    activity_bonus_categories: List[str] = Field(
        default_factory=list,
        description=(
            "Manually selected in-game Activities production bonus category codes. "
            "For refining use raw material codes such as COMMON_ORE, COMMON_WOOD, COMMON_HIDE, COMMON_FIBER, COMMON_ROCK."
        ),
    )

    @field_validator("tiers")
    @classmethod
    def validate_tiers(cls, value: List[int]) -> List[int]:
        if not value:
            raise ValueError("tiers must contain at least one tier")
        invalid = [tier for tier in value if tier < 2 or tier > 8]
        if invalid:
            raise ValueError(f"refining tiers must be between 2 and 8; invalid: {invalid}")
        return sorted(set(value))


class RefiningResponse(BaseModel):
    """List of refining opportunities (material × tier × refine city × sell city)."""

    rows: List[Dict[str, Any]] = Field(
        ..., description="Each row = one refining opportunity"
    )
    count: int = Field(..., description="Number of rows returned after filters.")
    tiers: List[int] = Field(..., description="Tiers included in this analysis.")
    focus_budget: int = Field(..., description="Daily focus budget used for this analysis.")
    investment_budget: int = Field(..., description="Silver budget used for route sizing.")
    material: str | None = Field(..., description="Material filter used for this analysis, null if all.")
    buy_city: str = Field(..., description="Input purchase city filter used for this analysis.")
    refine_city: str = Field(..., description="Refining city filter used for this analysis.")
    sell_city: str = Field(..., description="Output sale city filter used for this analysis.")
    bonus_only: bool = Field(..., description="Whether only dedicated refining-bonus city rows are included.")
    activity_bonus_categories: List[str] = Field(
        ..., description="Activity bonus category codes used for this analysis."
    )
    generated_at: str = Field(..., description="ISO-8601 timestamp when the response was generated.")
