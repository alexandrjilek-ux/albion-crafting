"""Sell recommendation endpoint schemas."""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field, field_validator


class SellItemInput(BaseModel):
    """One item stack the player has in inventory."""

    unique_name: str = Field(
        ...,
        min_length=3,
        description="AODP item id, e.g. T4_BAG or T5_PLANKS. Enchants use @N.",
    )
    quantity: int = Field(..., ge=1, le=9999, description="Number of items to sell.")
    category: str = Field(
        default="UNKNOWN",
        description="Item category used to estimate fast-travel weight.",
    )
    tier: Optional[int] = Field(
        default=None,
        ge=1,
        le=8,
        description="Item tier used to estimate fast-travel weight.",
    )

    @field_validator("unique_name")
    @classmethod
    def normalize_unique_name(cls, value: str) -> str:
        return value.strip().upper()

    @field_validator("category")
    @classmethod
    def normalize_category(cls, value: str) -> str:
        cleaned = value.strip().upper()
        return cleaned or "UNKNOWN"


class SellRequest(BaseModel):
    """Request body for POST /sell."""

    from_city: str = Field(
        default="Bridgewatch",
        description="City where the player currently has the items.",
    )
    history_days: int = Field(
        default=7,
        ge=1,
        le=30,
        description="Days of AODP history used for volume and confidence.",
    )
    items: List[SellItemInput] = Field(
        ...,
        min_length=1,
        max_length=12,
        description="Inventory stacks to evaluate.",
    )


class SellCityOption(BaseModel):
    """One possible sell city for one inventory item."""

    city: str
    sell_min: int = Field(..., description="Lowest sell order in the city.")
    gross_revenue: int = Field(..., description="sell_min * quantity before tax.")
    market_tax: int = Field(..., description="Market tax paid on sale.")
    transport_fee: int = Field(..., description="Fast-travel fee for this stack.")
    net_revenue: int = Field(
        ..., description="Gross revenue minus market tax and transport fee."
    )
    fee_per_item: int = Field(..., description="Transport fee per item.")
    avg_daily_volume: int = Field(..., description="Average daily sold volume.")
    sell_updated: str = Field(default="", description="AODP sell price timestamp.")
    confidence_score: int = Field(..., ge=0, le=100)
    risk_label: str
    risk_flags: List[str] = Field(default_factory=list)


class SellItemResult(BaseModel):
    """Best sell recommendation for one inventory item stack."""

    unique_name: str
    quantity: int
    category: str
    tier: Optional[int]
    best_city: Optional[str]
    best_net_revenue: int
    best_sell_min: int
    options: List[SellCityOption] = Field(default_factory=list)
    warning: Optional[str] = None


class SellResponse(BaseModel):
    """Sell recommendations for all provided inventory stacks."""

    rows: List[SellItemResult]
    count: int
    from_city: str
    generated_at: str = Field(..., description="ISO-8601 timestamp.")
