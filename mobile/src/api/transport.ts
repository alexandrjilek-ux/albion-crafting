import { apiFetch } from './client';
import type { TransportRequest, TransportResponse } from './types';

// GET /transport — fast-travel fee. Same-city = free, Caerleon counts as
// royal city. Pozor: Outlands portály jsou PvP; tenhle endpoint počítá jen
// fast-travel mezi royalkami.
export function fetchTransportFee(req: TransportRequest): Promise<TransportResponse> {
  const { from_city, to_city, category, tier, num_items, item_value = 0 } = req;
  return apiFetch<TransportResponse>('/transport', {
    method: 'GET',
    query: {
      from_city,
      to_city,
      category,
      tier,
      num_items,
      item_value,
    },
  });
}
