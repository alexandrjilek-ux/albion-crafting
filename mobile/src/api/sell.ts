import { apiFetch } from './client';
import type { SellRequest, SellResponse } from './types';

export function fetchSellRecommendations(req: SellRequest): Promise<SellResponse> {
  return apiFetch<SellResponse>('/sell', {
    method: 'POST',
    body: req,
  });
}
