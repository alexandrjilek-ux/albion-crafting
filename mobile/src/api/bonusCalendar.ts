import { apiFetch } from './client';
import type { BonusCalendarResponse } from './types';

export function fetchBonusCalendar(): Promise<BonusCalendarResponse> {
  return apiFetch<BonusCalendarResponse>('/bonus-calendar', {
    method: 'GET',
    timeoutMs: 30_000,
  });
}
