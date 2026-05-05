import { apiFetch, ApiError } from './client';
import type {
  ItemSearchResponse,
  JobProgressResponse,
  JobStartResponse,
  TopItemsRequest,
  TopItemsResponse,
} from './types';

// POST /items/top — equipment / food top profitable items.
// Synchronní varianta — blokuje ~30 s pro auto mode. Necháno pro testy / cURL.
// Mobile UI volá místo toho `fetchTopItemsWithProgress` (async + per-city
// progress events).
export function fetchTopItems(req: TopItemsRequest = {}): Promise<TopItemsResponse> {
  return apiFetch<TopItemsResponse>('/items/top', {
    method: 'POST',
    body: req,
    timeoutMs: 120_000,
  });
}

export function searchItems(q: string, limit = 12): Promise<ItemSearchResponse> {
  return apiFetch<ItemSearchResponse>('/items/search', {
    method: 'GET',
    query: { q, limit },
  });
}

// ─── Async job flow (POST /start → GET /progress/{id}) ────────────────

function startTopItemsJob(req: TopItemsRequest): Promise<JobStartResponse> {
  return apiFetch<JobStartResponse>('/items/top/start', {
    method: 'POST',
    body: req,
    timeoutMs: 30_000,
  });
}

function pollTopItemsJob(jobId: string): Promise<JobProgressResponse> {
  return apiFetch<JobProgressResponse>(`/items/top/progress/${encodeURIComponent(jobId)}`, {
    method: 'GET',
    timeoutMs: 15_000,
  });
}

export interface ProgressEvent {
  label: string; // "Stahuji Bridgewatch"
  step: number;  // 1-based
  total: number; // počet kroků (5 pro auto, 1 pro single-city)
}

interface ProgressOptions {
  onProgress?: (ev: ProgressEvent) => void;
  pollIntervalMs?: number; // default 500
  maxWaitMs?: number;      // safety net — default 180 s
  signal?: AbortSignal;    // cancel z volajícího (např. cleanup hooku)
}

/**
 * Combines POST /start + repeated GET /progress poll loop into one promise.
 *
 * Resolve: `TopItemsResponse` až backend job dosáhne status='done'.
 * Reject:  `ApiError` při HTTP error, timeout, nebo abort.
 *
 * Volající dostane průběžné `onProgress({label, step, total})` eventy —
 * mezi každým pollem (default 500 ms). Když uživatel přepne filter mid-run,
 * předáme `signal` z `AbortController` a poll loop se zastaví bez race
 * condition (job na backendu doběhne, ale výsledek se zahodí — JOBS dict
 * lazy-GC se postará o cleanup).
 */
export async function fetchTopItemsWithProgress(
  req: TopItemsRequest,
  opts: ProgressOptions = {},
): Promise<TopItemsResponse> {
  const { onProgress, pollIntervalMs = 500, maxWaitMs = 180_000, signal } = opts;

  const start = await startTopItemsJob(req);
  const deadline = Date.now() + maxWaitMs;

  while (true) {
    if (signal?.aborted) {
      throw new ApiError(0, 'Aborted by client');
    }
    if (Date.now() > deadline) {
      throw new ApiError(0, `Job timed out after ${maxWaitMs} ms`);
    }

    const status = await pollTopItemsJob(start.job_id);

    if (status.status === 'running') {
      onProgress?.({
        label: status.progress,
        step: status.step,
        total: status.total,
      });
      await sleep(pollIntervalMs);
      continue;
    }

    if (status.status === 'error') {
      // 'value' = bad input (HTTP 400 ekvivalent), 'upstream' = AODP/Gameinfo.
      // Frontend obojí ukáže jako error block — rozlišení může být užitečné
      // později pro UX (např. retry button jen u 'upstream').
      throw new ApiError(status.error_kind === 'value' ? 400 : 502, status.error);
    }

    // status === 'done'
    onProgress?.({
      label: status.progress, // typicky "Hotovo"
      step: status.total,
      total: status.total,
    });
    return status.result;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
