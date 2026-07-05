"""Top profitable items (equipment + food).

Two flavors of the same analysis:

* ``POST /items/top`` — synchronous, blocks until done. Used by tests / cURL.
* ``POST /items/top/start`` + ``GET /items/top/progress/{job_id}`` — async with
  per-city progress events for the mobile UI ("Stahuji Bridgewatch (1/5)…").
  Polling-based to avoid SSE/streaming complexity in React Native.
"""

from __future__ import annotations

import threading
import time
import traceback
import uuid
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException

from app.schemas.items import ItemSearchResponse, TopItemsRequest, TopItemsResponse
from app.services.item_search_service import search_items
from app.services.items_service import get_top_items

router = APIRouter(prefix="/items", tags=["items"])


@router.get(
    "/search",
    response_model=ItemSearchResponse,
    summary="Autocomplete item names / ids",
)
def item_search(q: str, limit: int = 12) -> ItemSearchResponse:
    try:
        result = search_items(query=q, limit=max(1, min(limit, 30)))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=502,
            detail=f"Item search failed: {type(exc).__name__}: {exc}",
        ) from exc
    return ItemSearchResponse(**result)


# ============================================================
# Synchronous endpoint (legacy / cURL friendly)
# ============================================================


@router.post(
    "/top",
    response_model=TopItemsResponse,
    summary="Top profitable craftable items (blocking)",
)
def top_items(req: TopItemsRequest) -> TopItemsResponse:
    """Synchronous variant — blocks ~30 s for auto mode. See module docstring."""
    try:
        result = get_top_items(
            city=req.city,
            tiers=req.tiers,
            enchants=req.enchants,
            mode=req.mode,
            use_focus=req.use_focus,
            focus_budget=req.focus_budget,
            top=req.top,
            sort_by=req.sort_by,
            min_volume=req.min_volume,
            history_days=req.history_days,
            spec_level=req.spec_level,
            station_fee=req.station_fee,
            bonus_only=req.bonus_only,
            no_caerleon=req.no_caerleon,
            market_mode=req.market_mode,
            activity_bonus_categories=req.activity_bonus_categories,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        print("\n[!!!] /items/top exception traceback:")
        traceback.print_exc()
        raise HTTPException(
            status_code=502,
            detail=f"Upstream (AODP / GameInfo) error: {type(exc).__name__}: {exc}",
        ) from exc

    return TopItemsResponse(**result)


# ============================================================
# Async polling-based endpoints
# ============================================================
#
# JOBS je in-memory dict — funguje pro single-instance backend (uvicorn workers
# = 1, default). Pokud někdy škálujeme na víc workerů / Procesů, vyměnit za
# Redis. Pro Phase 1 (single user) tohle stačí.
#
# Lifecycle:
#   POST /items/top/start  → vytvoří job, spustí thread, vrátí job_id
#   GET  /items/top/progress/{job_id}
#       status='running' → {progress, step, total}
#       status='done'    → {result: TopItemsResponse}
#       status='error'   → {error: str}
#
# Cleanup: jobs ve stavu 'done' nebo 'error' starší než JOB_TTL_SECONDS se
# uklidí při každém GET /progress (lazy GC). Bez vlastního scheduler tasku.

JOB_TTL_SECONDS = 300  # 5 min — víc než dost, frontend si pull-ne výsledek během 1-2 s

JOBS: Dict[str, Dict[str, Any]] = {}
_JOBS_LOCK = threading.Lock()


def _cleanup_old_jobs() -> None:
    """Remove finished jobs older than JOB_TTL_SECONDS. Lazy GC."""
    cutoff = time.time() - JOB_TTL_SECONDS
    with _JOBS_LOCK:
        stale = [
            job_id
            for job_id, job in JOBS.items()
            if job.get("status") in ("done", "error")
            and job.get("finished_at", 0) < cutoff
        ]
        for job_id in stale:
            JOBS.pop(job_id, None)


def _run_job(job_id: str, req: TopItemsRequest) -> None:
    """Worker thread — runs the analysis, updates JOBS dict with progress + result."""

    def on_progress(label: str, step: int, total: int) -> None:
        with _JOBS_LOCK:
            if job_id in JOBS:
                JOBS[job_id]["progress"] = label
                JOBS[job_id]["step"] = step
                JOBS[job_id]["total"] = total

    try:
        result = get_top_items(
            city=req.city,
            tiers=req.tiers,
            enchants=req.enchants,
            mode=req.mode,
            use_focus=req.use_focus,
            focus_budget=req.focus_budget,
            top=req.top,
            sort_by=req.sort_by,
            min_volume=req.min_volume,
            history_days=req.history_days,
            spec_level=req.spec_level,
            station_fee=req.station_fee,
            bonus_only=req.bonus_only,
            no_caerleon=req.no_caerleon,
            market_mode=req.market_mode,
            activity_bonus_categories=req.activity_bonus_categories,
            progress_callback=on_progress,
        )
        with _JOBS_LOCK:
            if job_id in JOBS:
                JOBS[job_id].update(
                    status="done",
                    result=result,
                    progress="Hotovo",
                    finished_at=time.time(),
                )
    except ValueError as exc:
        with _JOBS_LOCK:
            if job_id in JOBS:
                JOBS[job_id].update(
                    status="error",
                    error=str(exc),
                    error_kind="value",
                    finished_at=time.time(),
                )
    except Exception as exc:  # noqa: BLE001
        print(f"\n[!!!] /items/top/start (job={job_id}) traceback:")
        traceback.print_exc()
        with _JOBS_LOCK:
            if job_id in JOBS:
                JOBS[job_id].update(
                    status="error",
                    error=f"{type(exc).__name__}: {exc}",
                    error_kind="upstream",
                    finished_at=time.time(),
                )


@router.post(
    "/top/start",
    summary="Start async top-items job, returns job_id for polling",
)
def start_top_items_job(req: TopItemsRequest) -> Dict[str, str]:
    _cleanup_old_jobs()
    job_id = str(uuid.uuid4())
    with _JOBS_LOCK:
        JOBS[job_id] = {
            "status": "running",
            "progress": "Připravuji…",
            "step": 0,
            "total": 0,
            "started_at": time.time(),
        }
    threading.Thread(target=_run_job, args=(job_id, req), daemon=True).start()
    return {"job_id": job_id}


@router.get(
    "/top/progress/{job_id}",
    summary="Poll async top-items job status / result",
)
def get_job_progress(job_id: str) -> Dict[str, Any]:
    _cleanup_old_jobs()
    with _JOBS_LOCK:
        job = JOBS.get(job_id)
        if not job:
            raise HTTPException(status_code=404, detail=f"Unknown job_id: {job_id}")
        # Shallow copy — JSON serializace bez race s background threadem.
        return dict(job)
