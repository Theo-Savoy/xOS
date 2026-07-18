import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

export type PicklistValue = {
  label: string;
  active: boolean;
  default: boolean;
};

type CacheEntry = {
  values: PicklistValue[];
  dependOn: string | null;
  ts: number;
};

const CACHE_TTL_MS = 60 * 60 * 1000;
const picklistCache = new Map<string, CacheEntry>();
const PicklistAccessTokenContext = createContext<string | undefined>(undefined);

export function PicklistValuesProvider({
  accessToken,
  children,
}: {
  accessToken?: string;
  children: ReactNode;
}) {
  return createElement(
    PicklistAccessTokenContext.Provider,
    { value: accessToken },
    children,
  );
}

export function __resetPicklistValuesCache() {
  picklistCache.clear();
}

function cacheKey(field: string, controllingValue?: string): string {
  return `${field}:${controllingValue ?? ''}`;
}

function cachedPicklist(
  field: string,
  controllingValue?: string,
): CacheEntry | null {
  const key = cacheKey(field, controllingValue);
  const cached = picklistCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.ts < CACHE_TTL_MS) return cached;
  picklistCache.delete(key);
  return null;
}

function parsePicklist(body: unknown): {
  values: PicklistValue[];
  dependOn: string | null;
} {
  if (
    !body ||
    typeof body !== 'object' ||
    !Array.isArray((body as { values?: unknown }).values)
  ) {
    throw new Error('La réponse de la picklist est invalide.');
  }
  const response = body as {
    values: unknown[];
    controllerName?: unknown;
  };
  return {
    values: response.values
      .filter(
        (value): value is Record<string, unknown> =>
          Boolean(value) &&
          typeof value === 'object' &&
          typeof (value as { label?: unknown }).label === 'string',
      )
      .map((value) => ({
        label: value.label as string,
        active: value.active === true,
        default: value.default === true,
      })),
    dependOn:
      typeof response.controllerName === 'string'
        ? response.controllerName
        : null,
  };
}

export function usePicklistValues(
  field: string,
  controllingValue?: string,
): {
  values: PicklistValue[];
  loading: boolean;
  error: string | null;
  dependOn: string | null;
} {
  const accessToken = useContext(PicklistAccessTokenContext);
  const initialPicklist = cachedPicklist(field, controllingValue);
  const [values, setValues] = useState<PicklistValue[]>(
    initialPicklist?.values ?? [],
  );
  const [dependOn, setDependOn] = useState<string | null>(
    initialPicklist?.dependOn ?? null,
  );
  const [loading, setLoading] = useState(initialPicklist === null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const key = cacheKey(field, controllingValue);
    const cached = cachedPicklist(field, controllingValue);
    if (cached) {
      setValues(cached.values);
      setDependOn(cached.dependOn);
      setLoading(false);
      setError(null);
      return () => {
        active = false;
      };
    }

    setValues([]);
    setDependOn(null);
    setLoading(Boolean(field));
    setError(null);
    if (!field) return () => undefined;

    void (async () => {
      try {
        if (!accessToken) throw new Error('Session expirée.');
        const controllingValueQuery =
          controllingValue === undefined
            ? ''
            : `&controllingValue=${encodeURIComponent(controllingValue)}`;
        const response = await fetch(
          `/api/crm/picklists?field=${encodeURIComponent(field)}${controllingValueQuery}`,
          {
            cache: 'no-store',
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        );
        if (!response.ok)
          throw new Error('Le chargement de la picklist a échoué.');
        const nextPicklist = parsePicklist(await response.json());
        picklistCache.set(key, { ...nextPicklist, ts: Date.now() });
        if (active) {
          setValues(nextPicklist.values);
          setDependOn(nextPicklist.dependOn);
        }
      } catch (cause) {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : 'Le chargement de la picklist a échoué.',
          );
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [accessToken, controllingValue, field]);

  return { values, loading, error, dependOn };
}
