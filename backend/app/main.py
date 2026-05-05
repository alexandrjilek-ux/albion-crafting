"""
FastAPI entry point for the Albion Crafting backend.

Run locally:
    uvicorn app.main:app --reload --port 8000

Swagger UI:  http://localhost:8000/docs
ReDoc:       http://localhost:8000/redoc
"""

from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.routes import bonus_calendar, cities, health, item_detail, items, leveling, refining, sell, transport


def create_app() -> FastAPI:
    """Application factory — keeps tests free of import-time side effects."""
    app = FastAPI(
        title="Albion Crafting API",
        version=__version__,
        description=(
            "Profit / refining / leveling / transport endpoints for the "
            "Albion Online crafting analyzer. Wraps the original Streamlit "
            "engine so the new mobile (Expo) frontend can call REST instead "
            "of scraping HTML."
        ),
    )

    # CORS — permissive for dev, locked down per environment in prod.
    # ALBION_CORS_ORIGINS env var = comma-separated list, "*" allowed.
    raw = os.getenv("ALBION_CORS_ORIGINS", "*")
    allow_origins = [o.strip() for o in raw.split(",") if o.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allow_origins,
        allow_credentials=False,  # safer with "*"
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Mount all route modules.
    app.include_router(health.router)
    app.include_router(cities.router)
    app.include_router(items.router)
    app.include_router(item_detail.router)
    app.include_router(refining.router)
    app.include_router(leveling.router)
    app.include_router(transport.router)
    app.include_router(sell.router)
    app.include_router(bonus_calendar.router)

    return app


app = create_app()
