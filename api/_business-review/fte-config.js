/**
 * api/_business-review/fte-config.js — ETP fournis par la direction (R13, D2).
 * Table settings, clé business_review_fte. Défauts codés si la clé est absente.
 */
export const FTE_SETTINGS_KEY = 'business_review_fte';

export const DEFAULT_FTE = {
  FY25: { sales: 4.17, sdr: 0 },
  FY26: { sales: 2.0, sdr: 1 },
};

function cloneDefaults() {
  return {
    FY25: { ...DEFAULT_FTE.FY25 },
    FY26: { ...DEFAULT_FTE.FY26 },
  };
}

export function normalizeFte(value) {
  const merged = cloneDefaults();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return merged;
  for (const [fy, row] of Object.entries(value)) {
    if (!row || typeof row !== 'object') continue;
    merged[fy] = {
      sales: Number(row.sales) || 0,
      sdr: Number(row.sdr) || 0,
    };
  }
  return merged;
}

export async function loadFte(client) {
  const { data, error } = await client
    .from('settings')
    .select('value')
    .eq('key', FTE_SETTINGS_KEY)
    .maybeSingle();
  if (error) throw new Error('fte_lookup_failed');
  if (!data?.value) return normalizeFte(null);
  return normalizeFte(data.value);
}

export async function saveFte(client, value) {
  const normalized = normalizeFte(value);
  const { error } = await client
    .from('settings')
    .upsert({ key: FTE_SETTINGS_KEY, value: normalized }, { onConflict: 'key' });
  if (error) throw new Error('fte_write_failed');
  return normalized;
}
