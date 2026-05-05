"""Albion calendar and production bonus schemas."""

from __future__ import annotations

from pydantic import BaseModel, Field


class BonusEntry(BaseModel):
    """Single auto-loaded bonus reference row."""

    code: str = Field(..., description="Stable source code for the bonus where available.")
    label: str = Field(..., description="Human readable bonus name.")
    duration_days_min: int | None = Field(default=None, description="Minimum visible duration in days.")
    duration_days_max: int | None = Field(default=None, description="Maximum visible duration in days.")


class BonusCalendarResponse(BaseModel):
    """Auto-loaded Albion bonus calendar reference."""

    daily_crafting: list[BonusEntry] = Field(
        ..., description="Daily production bonus category pool; two categories are selected after downtime."
    )
    rotating_activities: list[BonusEntry] = Field(
        ..., description="Rotating activity bonuses exposed by the public source."
    )
    rotating_gathering: list[BonusEntry] = Field(
        ..., description="Rotating gathering bonuses exposed by the public source."
    )
    source_url: str = Field(..., description="Public source URL used for the automatic load.")
    source_updated_label: str | None = Field(
        default=None,
        description="Textual update label shown by the source, if it was found.",
    )
    exact_week_schedule_available: bool = Field(
        ...,
        description="Whether the public source exposes exact day-by-day upcoming bonuses.",
    )
    note: str = Field(..., description="Short explanation of what the source does and does not expose.")
    generated_at: str = Field(..., description="ISO-8601 timestamp when the response was generated.")
