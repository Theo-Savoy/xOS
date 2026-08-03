import { describe, expect, it } from 'vitest';
import { buildAuditRow, AUDIT_RESULTS } from './audit.js';

describe('buildAuditRow', () => {
  it('requires action and result', () => {
    expect(() => buildAuditRow({ result: 'success' })).toThrow(/action/);
    expect(() => buildAuditRow({ action: 'dial' })).toThrow(/result/);
  });

  it('produces a row with timestamps and request_id', () => {
    const row = buildAuditRow({
      actorUserId: 'u1',
      actorKind: 'user',
      action: 'dial',
      result: 'success',
      costCents: 5,
      campaignId: 'c1',
      callId: 'call1',
    });
    expect(row.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(row.actor_user_id).toBe('u1');
    expect(row.actor_kind).toBe('user');
    expect(row.action).toBe('dial');
    expect(row.result).toBe('success');
    expect(row.cost_cents).toBe(5);
    expect(row.metadata.request_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('respects custom metadata request_id (idempotent retry trace)', () => {
    const row = buildAuditRow({
      action: 'dial',
      result: 'success',
      metadata: { request_id: 'custom-123' },
    });
    expect(row.metadata.request_id).toBe('custom-123');
  });

  it('defaults cost to 0', () => {
    const row = buildAuditRow({ action: 'dial', result: 'success' });
    expect(row.cost_cents).toBe(0);
  });
});

describe('AUDIT_RESULTS enum', () => {
  it('exposes the 7 documented results', () => {
    expect(Object.keys(AUDIT_RESULTS)).toHaveLength(7);
    expect(AUDIT_RESULTS.SUCCESS).toBe('success');
    expect(AUDIT_RESULTS.FAILED).toBe('failed');
    expect(AUDIT_RESULTS.RATE_LIMITED).toBe('rate_limited');
    expect(AUDIT_RESULTS.BUDGET_EXCEEDED).toBe('budget_exceeded');
    expect(AUDIT_RESULTS.DRY_RUN).toBe('dry_run');
    expect(AUDIT_RESULTS.INVALID_REQUEST).toBe('invalid_request');
    expect(AUDIT_RESULTS.AUTH_FAILED).toBe('auth_failed');
  });
});