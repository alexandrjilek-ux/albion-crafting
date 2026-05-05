import { apiFetch } from './client';
import type { RefiningRequest, RefiningResponse } from './types';

// POST /refining — ore→bar / wood→planks / hide→leather / fiber→cloth.
export function fetchRefining(req: RefiningRequest = {}): Promise<RefiningResponse> {
  return apiFetch<RefiningResponse>('/refining', {
    method: 'POST',
    body: req,
  });
}
