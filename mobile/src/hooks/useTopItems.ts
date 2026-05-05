// Lightweight useState/useEffect hook — žádné @tanstack/react-query, ať
// build je čistý a ať user může později swapnout za TanStack v jednom místě.

import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchTopItemsWithProgress, type ProgressEvent } from '@api/items';
import type { TopItemsRequest, TopItemsResponse } from '@api/types';

export interface ProgressState {
  label: string; // "Stahuji Bridgewatch"
  step: number;
  total: number;
}

interface UseTopItemsState {
  data: TopItemsResponse | null;
  loading: boolean;
  error: string | null;
  progress: ProgressState | null; // null = job ještě nezačal nebo done
  /** Re-run dotaz s prázdným screenem (pro error retry / req change). */
  refetch: () => Promise<void>;
  /** Re-run dotaz, ale zachovej stávající data viditelná (pro pull-to-refresh). */
  refresh: () => Promise<void>;
}

export function useTopItems(req: TopItemsRequest | null): UseTopItemsState {
  const [data, setData] = useState<TopItemsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressState | null>(null);

  // Stabilní ref na poslední request — debouncuje proti rapid-fire change
  // (uživatel mění filter chips). JSON.stringify je levný hash.
  const reqHash = req ? JSON.stringify(req) : 'idle';
  const reqRef = useRef(reqHash);
  reqRef.current = reqHash;

  // AbortController pro zrušení polling loopu při change filtru. Nový req
  // → starý job se zruší, frontend přestane pollovat, backend job dobíhá
  // sám (lazy-GC v JOBS dict).
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async (preserveData = false) => {
    if (!req) {
      abortRef.current?.abort();
      setLoading(false);
      setError(null);
      setProgress(null);
      if (!preserveData) setData(null);
      return;
    }

    const myHash = reqRef.current;

    // Zruš předchozí poll (pokud běží).
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    setProgress(null);
    // Vyčisti stará data: bez tohoto by switch food→equipment ukazoval
    // staré food itemy zatímco backend stahuje nové.
    // Výjimka: pull-to-refresh (preserveData=true) nechává staré výsledky
    // viditelné, aby uživatel měl co číst při swipu.
    if (!preserveData) setData(null);

    try {
      const result = await fetchTopItemsWithProgress(req, {
        signal: controller.signal,
        onProgress: (ev: ProgressEvent) => {
          // Ignoruj events ze starého requestu (mezitím přepnul filter).
          if (reqRef.current !== myHash) return;
          setProgress({ label: ev.label, step: ev.step, total: ev.total });
        },
      });
      if (reqRef.current !== myHash) return;
      setData(result);
      setProgress(null);
    } catch (err) {
      if (reqRef.current !== myHash) return;
      // Aborted (filter change) — silently swallow, nepiš error block.
      if (err instanceof Error && /Aborted by client/i.test(err.message)) return;
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
    } finally {
      if (reqRef.current === myHash) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reqHash]);

  useEffect(() => {
    if (req) {
      void run(false);
    } else {
      abortRef.current?.abort();
      setLoading(false);
      setProgress(null);
    }
    // Při unmountu nebo req change zruš running poll.
    return () => {
      abortRef.current?.abort();
    };
  }, [run]);

  return {
    data,
    loading,
    error,
    progress,
    refetch: () => run(false),
    refresh: () => run(true),
  };
}
