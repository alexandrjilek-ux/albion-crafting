"""Health-check endpoint."""

from fastapi import APIRouter

from app import __version__

router = APIRouter(tags=["health"])


@router.get("/healthz", summary="Liveness probe")
def healthz() -> dict:
    """Returns 200 + version. Used by load balancers and the smoke test."""
    return {"ok": True, "version": __version__}
