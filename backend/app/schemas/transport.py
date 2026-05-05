"""Transport (fast-travel fee) calculator schemas."""

from pydantic import BaseModel, Field


class TransportResponse(BaseModel):
    """Fast travel fee breakdown for a single batch transport."""

    from_city: str
    to_city: str
    category: str
    tier: int
    num_items: int

    weight_per_item: float = Field(..., description="kg per single item")
    total_weight_kg: float
    total_fee: float = Field(..., description="Total silver fast-travel fee")
    total_risk: float = Field(
        ..., description="Expected loss from PvP risk (always 0 for fast travel)"
    )
    total_cost: float = Field(..., description="fee + risk")
    fee_per_item: float
    method_label: str
    is_feasible: bool
