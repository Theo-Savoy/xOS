/**
 * api/_dialer/config.js — Telnyx configuration loader.
 *
 * Spec: docs/specs/lot-11.1-telnyx-infra.md §2.7.
 *
 * Behavior:
 * - TELNYX_ENV ∈ { dev, prod, dryrun } — determines which API key is used.
 * - default = 'dev' if NODE_ENV !== 'production', else 'prod'.
 * - dryrun: never hits the network. Returns fixture responses.
 * - Missing API key (other than dryrun) → throws. Fail-closed.
 * - WEBHOOK_TELNYX_PUBLIC_KEY optional ici : la clé ne sert qu'à vérifier les
 *   webhooks de retour (événements des appels sortants). Sans elle, le receiver
 *   répond 503 (webhooks.js) — le dial sort quand même. Fail-closed préservé.
 */

const VALID_ENVS = new Set(['dev', 'prod', 'dryrun']);

function readEnv(name) {
  const value = process.env[name];
  if (!value || value.trim() === '') return null;
  return value.trim();
}

function resolveTelnyxEnv() {
  const explicit = readEnv('TELNYX_ENV');
  if (explicit) {
    if (!VALID_ENVS.has(explicit)) {
      throw new Error(
        `TELNYX_ENV=${explicit} is invalid. Must be one of: ${[...VALID_ENVS].join(', ')}`,
      );
    }
    return explicit;
  }
  return process.env.NODE_ENV === 'production' ? 'prod' : 'dev';
}

export function loadDialerConfig() {
  const env = resolveTelnyxEnv();
  const isDryRun = env === 'dryrun';

  const apiKey = isDryRun
    ? 'DRYRUN_KEY'
    : readEnv(env === 'prod' ? 'TELNYX_API_KEY_PROD' : 'TELNYX_API_KEY_DEV');

  if (!isDryRun && !apiKey) {
    throw new Error(
      `TELNYX_API_KEY_${env.toUpperCase()} is required when TELNYX_ENV=${env}. ` +
        'Refusing to start without explicit credentials (fail-closed).',
    );
  }

  const callerId = readEnv(
    env === 'prod' ? 'TELNYX_CALLER_ID_PROD' : 'TELNYX_CALLER_ID_DEV',
  );

  const webhookPublicKey = readEnv('WEBHOOK_TELNYX_PUBLIC_KEY');

  const toleranceSec = Number(readEnv('WEBHOOK_TELNYX_TOLERANCE_SEC') ?? '300');

  return Object.freeze({
    env,
    isDryRun,
    apiKey,
    callerId,
    webhookPublicKey,
    webhookToleranceSec: Number.isFinite(toleranceSec) ? toleranceSec : 300,
    apiBase: 'https://api.telnyx.com/v2',
  });
}

/**
 * Feature flags from Supabase settings table.
 * Loaded at request time, not at module load (so test mocks work).
 */
export async function loadDialerFlags(client) {
  const keys = [
    'dialer_enabled',
    'dialer_dry_run',
    'dialer_budget_session_cents',
    'dialer_budget_user_day_cents',
    'dialer_budget_org_month_cents',
    'dialer_rate_rps',
    'dialer_rate_burst',
    'dialer_alert_threshold_pct',
    'dialer_webhook_tolerance_sec',
  ];
  const { data, error } = await client
    .from('settings')
    .select('key, value')
    .in('key', keys);
  if (error) throw new Error(`Failed to load dialer flags: ${error.message}`);

  const map = Object.fromEntries((data ?? []).map((row) => [row.key, row.value]));

  return Object.freeze({
    enabled: map.dialer_enabled === 'true' || map.dialer_enabled === true,
    dryRun:
      map.dialer_dry_run === undefined
        ? null
        : map.dialer_dry_run === 'true' || map.dialer_dry_run === true,
    budgetSessionCents: Number(map.dialer_budget_session_cents ?? 300),
    budgetUserDayCents: Number(map.dialer_budget_user_day_cents ?? 1000),
    budgetOrgMonthCents: Number(map.dialer_budget_org_month_cents ?? 15000),
    rateRps: Number(map.dialer_rate_rps ?? 5),
    rateBurst: Number(map.dialer_rate_burst ?? 20),
    alertThresholdPct: Number(map.dialer_alert_threshold_pct ?? 80),
    webhookToleranceSec: Number(map.dialer_webhook_tolerance_sec ?? 300),
  });
}