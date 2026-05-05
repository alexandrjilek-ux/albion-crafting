// Tenký fetch wrapper kolem FastAPI backendu.
// Base URL pochází z `EXPO_PUBLIC_API_URL`. Když není, fallback localhost
// (užitečné v iOS simulátoru, Android emulator potřebuje 10.0.2.2 — uprav
// .env.local).

import type { ErrorResponse } from './types';

const DEFAULT_BASE_URL = 'http://localhost:8000';

export const API_BASE_URL: string =
  (process.env.EXPO_PUBLIC_API_URL as string | undefined)?.replace(/\/+$/, '') ??
  DEFAULT_BASE_URL;

export class ApiError extends Error {
  status: number;
  detail: string;
  constructor(status: number, detail: string) {
    super(`[${status}] ${detail}`);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

interface FetchOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  // Default 60 s — AODP roundtrip + cache lookup. Pro /items/top má smysl
  // bumpnout na 120 s (sekvenční AODP scan napříč tieru × městy).
  timeoutMs?: number;
  query?: Record<string, string | number | boolean | undefined | null>;
}

function buildUrl(path: string, query?: FetchOptions['query']): string {
  const url = path.startsWith('http')
    ? path
    : `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;

  if (!query) return url;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null) continue;
    params.append(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

async function readErrorDetail(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as Partial<ErrorResponse> | undefined;
    if (data && typeof data.detail === 'string') return data.detail;
  } catch {
    // not JSON
  }
  return res.statusText || `HTTP ${res.status}`;
}

export async function apiFetch<T>(path: string, opts: FetchOptions = {}): Promise<T> {
  const { body, timeoutMs = 60_000, query, headers, ...rest } = opts;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const init: RequestInit = {
      ...rest,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(headers ?? {}),
      },
    };
    if (body !== undefined) {
      init.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    const res = await fetch(buildUrl(path, query), init);
    if (!res.ok) {
      const detail = await readErrorDetail(res);
      throw new ApiError(res.status, detail);
    }
    // Some endpoints (none today, but be ready) might return 204.
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    // Hermes (React Native) nemá globální `DOMException`, takže detekujeme
    // abort přes `err.name`. AbortController.abort() nahodí Error s name='AbortError'.
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ApiError(0, `Request timed out after ${timeoutMs} ms`);
    }
    const msg = err instanceof Error ? err.message : 'Network error';
    throw new ApiError(0, msg);
  } finally {
    clearTimeout(timer);
  }
}
