"""Shared Pydantic primitives reused across endpoints."""

from typing import Literal

from pydantic import BaseModel, Field

# Royal cities (sell/craft destinations) — Caerleon included.
CityName = Literal[
    "Bridgewatch",
    "Martlock",
    "Lymhurst",
    "Thetford",
    "Fort Sterling",
    "Caerleon",
]

# "Auto" sentinel = compare all royal cities and pick best per item.
AUTO_CITY = "auto"

# Sort keys exposed by the equipment/food analyzer.
SortKey = Literal[
    "silver_per_focus",
    "profit_focus",
    "profit_no_focus",
    "margin_focus_%",
]

# Two analysis modes — equipment scans armor/weapons, food scans meals.
AnalysisMode = Literal["equipment", "food"]


class ErrorResponse(BaseModel):
    """Standard error envelope returned with 4xx/5xx."""

    detail: str = Field(..., description="Human-readable error message")
