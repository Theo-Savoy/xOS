import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../lib/apiClient';

type ReviewQuery = {
  fy: string;
  compare: string;
};

type ReviewState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  fetchedAt: number | null;
};

const cache = new Map<string, { data: unknown; fetchedAt: number }>();

function cacheKey(resource: string, fy: string, compare: string) {
  return `${resource}|${fy}|${compare}`;
}

export function useBusinessReview<T>(
  token: string | null,
  resource: string | null,
  { fy, compare }: ReviewQuery,
): ReviewState<T> & { refresh: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const inflight = useRef(0);

  const refresh = useCallback(() => {
    if (resource) cache.delete(cacheKey(resource, fy, compare));
    setTick((n) => n + 1);
  }, [resource, fy, compare]);

  useEffect(() => {
    if (!token || !resource) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    const key = cacheKey(resource, fy, compare);
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
    const path = `/api/review?resource=${encodeURIComponent(resource)}&fy=${encodeURIComponent(fy)}&compare=${encodeURIComponent(compare)}`;
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
  }, [token, resource, fy, compare, tick]);

  return { data, loading, error, fetchedAt, refresh };
}
