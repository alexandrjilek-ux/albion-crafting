import { apiFetch } from './client';
import type { ItemDetailResponse } from './types';

// GET /items/{unique_name} — detail jednoho itemu (recipe, ceny, history).
//
// `unique_name` může obsahovat enchant suffix (T6_ARMOR_PLATE_SET1@2). Encoduj
// `@` přes encodeURIComponent — FastAPI path parser to jinak ujede do "1" bez
// enchantu (`@` je sice valid v path, ale Expo občas šedí URL filterem).
//
// Timeout 60 s — endpoint dělá ~7 AODP volání (prices + history pro item +
// suroviny napříč 6 městy). Po prvním fetchnutí má backend cache, takže
// následné requesty jsou < 5 s.
export function fetchItemDetail(
  uniqueName: string,
  opts: { historyDays?: number; quality?: number } = {},
): Promise<ItemDetailResponse> {
  const path = `/items/${encodeURIComponent(uniqueName)}`;
  return apiFetch<ItemDetailResponse>(path, {
    method: 'GET',
    query: {
      history_days: opts.historyDays ?? 14,
      quality: opts.quality ?? 1,
    },
    timeoutMs: 60_000,
  });
}
