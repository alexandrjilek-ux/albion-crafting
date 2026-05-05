import { apiFetch } from './client';
import type { CitiesResponse } from './types';

// GET /cities — read-only metadata o royal city bonusech (equipment + food).
export function fetchCities(): Promise<CitiesResponse> {
  return apiFetch<CitiesResponse>('/cities');
}
