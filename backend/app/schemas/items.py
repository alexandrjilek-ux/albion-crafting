"""Equipment / food top-items endpoint schemas."""

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .common import AnalysisMode, SortKey


class TopItemsRequest(BaseModel):
    """
    Request body for POST /items/top.

    Mirrors the Streamlit sidebar parameters but with sane defaults so
    a minimal payload `{}` returns something useful.
    """

    city: str = Field(
        default="auto",
        description=(
            "Craft city name (e.g. 'Martlock'). Use 'auto' to compare all "
            "royal cities and pick the best craft city per item."
        ),
    )
    tiers: List[int] = Field(
        default_factory=lambda: [4],
        description="Tiers to scan (4–8 for equipment, 3–8 for food)",
    )
    enchants: List[int] = Field(
        default_factory=lambda: [0],
        description="Enchant levels (0–3). Ignored for food.",
    )
    mode: AnalysisMode = Field(
        default="equipment", description="'equipment' or 'food'"
    )
    use_focus: bool = Field(
        default=True,
        description="Whether the player has focus to spend today",
    )
    focus_budget: int = Field(
        default=10_000,
        ge=0,
        le=30_000,
        description="Daily focus budget (10000 = premium default)",
    )
    top: int = Field(default=30, ge=1, le=200, description="Max rows to return")
    sort_by: SortKey = Field(default="silver_per_focus")
    min_volume: int = Field(
        default=10, ge=0, le=200, description="Min daily AODP volume filter"
    )
    history_days: int = Field(default=7, ge=1, le=30)
    spec_level: int = Field(default=4, ge=0, le=100)
    station_fee: float = Field(
        default=1.5,
        ge=0.0,
        le=5.0,
        description="Crafting station fee, percent of nominal cost",
    )
    bonus_only: bool = Field(default=False)
    no_caerleon: bool = Field(default=False)
    market_mode: Optional[
        Literal["all", "royal_no_caerleon", "black_market_only"]
    ] = Field(
        default=None,
        description=(
            "Optional web pilot sell target preset. black_market_only uses "
            "Black Market buy orders as the Forge sell destination. None keeps "
            "the legacy local-craft behavior used by mobile."
        ),
    )
    activity_bonus_categories: List[str] = Field(
        default_factory=list,
        description=(
            "Manually selected in-game Activities production bonus category codes. "
            "Examples: COMMON_SWORD, COMMON_ORE, COMMON_FOOD."
        ),
    )

    @field_validator("tiers")
    @classmethod
    def validate_tiers(cls, value: List[int]) -> List[int]:
        if not value:
            raise ValueError("tiers must contain at least one tier")
        invalid = [tier for tier in value if tier < 3 or tier > 8]
        if invalid:
            raise ValueError(f"tiers must be between 3 and 8; invalid: {invalid}")
        return sorted(set(value))

    @field_validator("enchants")
    @classmethod
    def validate_enchants(cls, value: List[int]) -> List[int]:
        if not value:
            return [0]
        invalid = [enchant for enchant in value if enchant < 0 or enchant > 3]
        if invalid:
            raise ValueError(f"enchants must be between 0 and 3; invalid: {invalid}")
        return sorted(set(value))

    @model_validator(mode="after")
    def validate_mode_specific_filters(self) -> "TopItemsRequest":
        if self.mode == "equipment":
            invalid = [tier for tier in self.tiers if tier < 4]
            if invalid:
                raise ValueError(f"equipment tiers must be between 4 and 8; invalid: {invalid}")
        if self.mode == "food":
            self.enchants = [0]
        return self


class TopItemsResponse(BaseModel):
    """List of top profitable items + run metadata."""

    # Each row from the engine has ~30+ fields with nested per-city sell
    # data. Returning them as Dict[str, Any] is intentional — the mobile
    # frontend will project the subset it cares about. Strict typing of
    # every field is premature until the FE design settles.
    model_config = ConfigDict(arbitrary_types_allowed=True)

    rows: List[Dict[str, Any]] = Field(..., description="Top items ranked by sort_by")
    count: int = Field(..., description="Number of rows returned")
    mode: AnalysisMode
    craft_city: str = Field(
        ..., description="City used for crafting ('Více měst' if auto)"
    )
    sort_by: str
    use_focus: bool
    focus_budget: int
    tiers: List[int]
    market_mode: Optional[str] = Field(default=None, description="Sell target preset used for the analysis.")
    generated_at: str = Field(..., description="ISO-8601 UTC timestamp")
    warning: Optional[str] = Field(
        default=None,
        description=(
            "Non-fatal warning, e.g. partial failure when some royal cities "
            "returned no data in auto mode."
        ),
    )


class ItemSearchResult(BaseModel):
    """One item suggestion for mobile autocomplete."""

    unique_name: str = Field(..., description="AODP item id.")
    name: str = Field(..., description="Readable item name.")
    tier: Optional[int] = Field(default=None, description="Parsed item tier if known.")
    category: Optional[str] = Field(default=None, description="Best-effort category for transport weight.")


class ItemSearchResponse(BaseModel):
    """Autocomplete suggestions for item names / ids."""

    rows: List[ItemSearchResult] = Field(default_factory=list)
    count: int = Field(..., description="Number of suggestions returned.")
    query: str = Field(..., description="Original search query.")
