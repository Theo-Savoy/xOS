/**
 * api/_dialer/audit.js — Audit log writer.
 *
 * Spec: docs/specs/lot-11.1-telnyx-infra.md §2.6.
 *
 * Every Telnyx action writes to dialer_audit_log BEFORE execution (best effort).
 * On failure to write the audit row, the action should still proceed but be
 * flagged. The audit log is forensically critical, not a transaction gate.
 */

import { randomUUID } from 'node:crypto';

export const AUDIT_RESULTS = {
  SUCCESS: 'success',
  FAILED: 'failed',
  RATE_LIMITED: 'rate_limited',
  BUDGET_EXCEEDED: 'budget_exceeded',
  DRY_RUN: 'dry_run',
  INVALID_REQUEST: 'invalid_request',
  AUTH_FAILED: 'auth_failed',
};

/**
 * Build an audit row (caller writes it to dialer_audit_log).
 */
export function buildAuditRow({
  actorUserId = null,
  actorKind = 'system',
  action,
  payload = {},
  costCents = 0,
  result,
  errorCode = null,
  campaignId = null,
  callId = null,
  durationMs = null,
  metadata = {},
}) {
  if (!action) throw new Error('audit row requires action');
  if (!result) throw new Error('audit row requires result');
  return {
    ts: new Date().toISOString(),
    actor_user_id: actorUserId,
    actor_kind: actorKind,
    action,
    payload,
    cost_cents: costCents,
    result,
    error_code: errorCode,
    campaign_id: campaignId,
    call_id: callId,
    duration_ms: durationMs,
    metadata: {
      ...metadata,
      request_id: metadata.request_id ?? randomUUID(),
    },
  };
}

/**
 * Insert an audit row. Returns inserted id or throws.
 * Caller is responsible for try/catch — we never let audit failures block the action,
 * but the caller should log the failure separately.
 */
export async function writeAudit(client, row) {
  const { data, error } = await client
    .from('dialer_audit_log')
    .insert(row)
    .select('id')
    .single();
  if (error) throw new Error(`audit insert failed: ${error.message}`);
  return data?.id;
}

/**
 * Wrap an action with audit logging. Best effort: audit failures are logged
 * to stderr but don't block the action. Use this when the action is critical
 * and the audit is for forensic purposes.
 */
export async function withAudit(client, row, actionFn) {
  let auditId = null;
  try {
    auditId = await writeAudit(client, row);
  } catch (e) {
    // Audit failure — log but continue
    console.error('[dialer.audit] failed to write audit row:', e.message);
  }
  try {
    const result = await actionFn();
    if (auditId) {
      // Optional: update the audit row with the result (best effort)
      try {
        await client
          .from('dialer_audit_log')
          .update({
            result: 'success',
            duration_ms: Date.now() - new Date(row.ts).getTime(),
          })
          .eq('id', auditId);
      } catch {
        /* ignore */
      }
    }
    return result;
  } catch (err) {
    if (auditId) {
      try {
        await client
          .from('dialer_audit_log')
          .update({
            result: 'failed',
            error_code: err.code ?? 'unknown',
          })
          .eq('id', auditId);
      } catch {
        /* ignore */
      }
    }
    throw err;
  }
}