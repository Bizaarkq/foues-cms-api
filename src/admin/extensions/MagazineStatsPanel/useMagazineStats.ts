import { useEffect, useRef, useState } from 'react';
import { useFetchClient } from '@strapi/strapi/admin';

export interface MagazineStat {
  documentId: string;
  date: string;
  visits: number;
  depth25: number;
  depth50: number;
  depth75: number;
  depth100: number;
}

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'success'; stats: MagazineStat[] };

interface UseMagazineStatsOptions {
  issueDocumentId: string;
  enabled: boolean;
}

interface UseMagazineStatsResult {
  state: State;
  refetch: () => void;
}

const STAT_UID = 'api::magazine-stat.magazine-stat';
const BASE_CM = '/content-manager/collection-types';

export function useMagazineStats({
  issueDocumentId,
  enabled,
}: UseMagazineStatsOptions): UseMagazineStatsResult {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [fetchTick, setFetchTick] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const { get } = useFetchClient();

  useEffect(() => {
    if (!enabled) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState({ kind: 'loading' });

    async function run() {
      try {
        const res = await get<{
          results: MagazineStat[];
          pagination: { total: number; pageSize: number };
        }>(`${BASE_CM}/${STAT_UID}`, {
          params: {
            'filters[issue][documentId][$eq]': issueDocumentId,
            sort: 'date:desc',
            'pagination[page]': 1,
            'pagination[pageSize]': 365,
          },
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;

        setState({ kind: 'success', stats: res.data?.results ?? [] });
      } catch (err) {
        if (controller.signal.aborted) return;
        const message = err instanceof Error ? err.message : 'Error al cargar las estadísticas.';
        setState({ kind: 'error', message });
      }
    }

    run();

    return () => {
      controller.abort();
    };
  }, [enabled, issueDocumentId, fetchTick]);

  function refetch() {
    setFetchTick((t) => t + 1);
  }

  return { state, refetch };
}
