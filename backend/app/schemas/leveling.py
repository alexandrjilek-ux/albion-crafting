"""Leveling cost calculator schemas (T2 → T4 Expert silver-per-fame analysis)."""

from typing import Any, Dict, List

from pydantic import BaseModel, Field


class LevelingRequest(BaseModel):
    """Request body for POST /leveling-cost."""

    city: str = Field(
        default="Bridgewatch",
        description="Craft city — bonus categories get cheaper return rate",
    )
    use_journal: bool = Field(
        default=False,
        description="Whether the player has a crafting journal (recovers ~70% of fame value as silver)",
    )


class LevelingResponse(BaseModel):
    """Per-item leveling paths sorted by silver-per-fame ratio."""

    rows: List[Dict[str, Any]] = Field(
        ..., description="Each row = one item × full T2→T4 Expert path"
    )
    count: int
    city: str
    use_journal: bool
    generated_at: str
