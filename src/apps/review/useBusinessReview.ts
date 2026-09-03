import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../lib/apiClient';
import {
  businessReviewPath,
  type PeriodSelection,
} from './review.period';

type ReviewState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  fetchedAt: number | null;
};

const cache = new Map<string, { data: unknown; fetchedAt: number }>();

export function useBusinessReview<T>(
  token: string | null,
  resource: string | null,
  period: PeriodSelection,
): ReviewState<T> & { refresh: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const inflight = useRef(0);
  const path = resource ? businessReviewPath(resource, period) : null;

  const refresh = useCallback(() => {
    if (path) cache.delete(path);
    setTick((n) => n + 1);
  }, [path]);

  useEffect(() => {
    if (!token || !resource || !path) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    const key = path || resource;
    const hit = cache.get(key);
    if (hit) {
      setData(hit.data as T);
      setFetchedAt(hit.fetchedAt);
      setLoading(false);
      setError(null);
      return;
    }

    const generation = ++inflight.current;
    setLoading(true);
    setError(null);
    apiFetch<T>(token, path)
      .then((payload) => {
        if (generation !== inflight.current) return;
        const at = Date.now();
        cache.set(key, { data: payload, fetchedAt: at });
        setData(payload);
        setFetchedAt(at);
      })
      .catch((err: unknown) => {
        if (generation !== inflight.current) return;
        setData(null);
        setError(err instanceof Error ? err.message : 'Erreur de chargement');
      })
      .finally(() => {
        if (generation !== inflight.current) return;
        setLoading(false);
      });
  }, [token, resource, path, tick]);

  return { data, loading, error, fetchedAt, refresh };
}
