"""Single-item detail endpoint schemas."""

from typing import List, Optional

from pydantic import BaseModel, Field


class RecipeMaterial(BaseModel):
    """Jedna surovina v receptu."""

    unique_name: str = Field(..., description="Item ID, např. 'T6_PLANKS'")
    name: str = Field(..., description="Lidský název, např. 'Whitewood Planks'")
    count: int = Field(..., description="Kolik kusů recept potřebuje pro 1 craft")


class Recipe(BaseModel):
    """Recept = suroviny + náklady (focus, silver fee, čas)."""

    item_id: str
    name: str
    focus_cost: Optional[int] = None
    silver_fee: Optional[int] = None
    time_seconds: Optional[float] = None
    materials: List[RecipeMaterial] = Field(default_factory=list)
    source: Optional[str] = Field(
        default=None, description="'gameinfo_api' nebo 'ao_bin_dumps'"
    )


class CityPrice(BaseModel):
    """Cena itemu / suroviny v jednom městě."""

    city: str
    sell_min: int = Field(..., description="Nejnižší sell order — to, co zaplatíš pokud kupuješ teď")
    buy_max: int = Field(..., description="Nejvyšší buy order — to, co dostaneš pokud prodáš teď")
    sell_updated: str = Field(default="", description="ISO timestamp posledního update sell ceny")
    buy_updated: str = Field(default="", description="ISO timestamp posledního update buy ceny")


class MaterialPrices(BaseModel):
    """Pro jednu surovinu: ceny ve všech royal cities."""

    unique_name: str
    name: str
    count: int = Field(..., description="Kolik recept požaduje (pro convenience render)")
    prices: List[CityPrice] = Field(default_factory=list)


class HistoryPoint(BaseModel):
    """Jeden den price history (denní agregát z AODP)."""

    date: str = Field(..., description="ISO timestamp začátku dne")
    avg_price: int
    item_count: int = Field(..., description="Daily volume (počet zobchodovaných kusů)")


class CityHistory(BaseModel):
    """Historie pro jedno město."""

    city: str
    points: List[HistoryPoint] = Field(default_factory=list)


class ItemDetailResponse(BaseModel):
    """Response pro GET /items/{unique_name}."""

    unique_name: str = Field(..., description="Plný ID včetně případného @N enchantu")
    base_id: str = Field(..., description="Bez @N suffixu")
    enchant: int = Field(default=0, description="0 = bez enchantu, 1–4 = enchant level")
    name: str = Field(..., description="Lidský název")
    tier: Optional[int] = None
    category: Optional[str] = None
    icon_url: str = Field(..., description="https://render.albiononline.com/v1/item/...")

    recipe: Optional[Recipe] = None
    item_prices: List[CityPrice] = Field(
        default_factory=list,
        description="Aktuální ceny tohoto itemu ve všech royal cities",
    )
    material_prices: List[MaterialPrices] = Field(
        default_factory=list,
        description="Ceny surovin per city (paralelně k recipe.materials)",
    )
    history: List[CityHistory] = Field(
        default_factory=list,
        description="Price history per city (default 14 dní, parametrizovatelné)",
    )

    history_days: int = Field(..., description="Kolik dní historie se vrátilo")
    generated_at: str
    warning: Optional[str] = None
