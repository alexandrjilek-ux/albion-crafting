import { apiFetch } from './client';
import type { LevelingRequest, LevelingResponse } from './types';

// POST /leveling-cost — silver-per-fame analýza T2→T4 Expert.
export function fetchLevelingCost(req: LevelingRequest = {}): Promise<LevelingResponse> {
  return apiFetch<LevelingResponse>('/leveling-cost', {
    method: 'POST',
    body: req,
  });
}
