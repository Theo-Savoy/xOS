import { beforeEach, describe, expect, it, vi } from 'vitest';

import { executeOpportunityCommand } from './execute.js';
import { previewOpportunityCommand } from './preview.js';

const ID = (n) => `006${String(n).padStart(12, '0')}`;

function opportunity(id, overrides = {}) {
  return {
    id,
    owner_id: '005000000000001',
    owner: 'Owner',
    account_id: '001000000000001',
    account: 'Account',
    account_owner_id: '005000000000002',
    close_date: '2026-06-01',
    stage: 'Projet qualifié / AO reçu',
    type_vente: 'Catalogue',
    loss_reason: null,
    is_closed: false,
    anomalies: [{ ruleId: 'close_date_overdue_under_3_months' }],
    ...overrides,
  };
}

function makeSupabase() {
  const commands = [];
  const journal = [];
  const client = {
    commands,
    journal,
    from(table) {
      const chain = {
        insert(payload) {
          chain.payload = payload;
          return chain;
        },
        update(payload) {
          chain.updatePayload = payload;
          return chain;
        },
        select() {
          return chain;
        },
        eq(field, value) {
          chain.filters ||= [];
          chain.filters.push([field, value]);
          return chain;
        },
        maybeSingle: async () => {
          const row =
            commands.find((item) =>
              (chain.filters || []).every(
                ([field, value]) => String(item[field]) === String(value),
              ),
            ) || null;
          return { data: row, error: null };
        },
        single: async () => {
          if (
            table === 'cleaner_commands' &&
            commands.some(
              (item) =>
                item.actor === chain.payload.actor &&
                item.idempotency_key === chain.payload.idempotency_key,
            )
          ) {
            return {
              data: null,
              error: { code: '23505', message: 'duplicate key' },
            };
          }
          const row = { id: commands.length + 1, ...chain.payload };
          commands.push(row);
          return { data: row, error: null };
        },
        then(resolve, reject) {
          if (chain.updatePayload) {
            const [field, value] = chain.filters?.[0] || [];
            const row = commands.find(
              (item) => String(item[field]) === String(value),
            );
            if (row) Object.assign(row, chain.updatePayload);
            return Promise.resolve({
              data: row || null,
              error: row ? null : { message: 'missing' },
            }).then(resolve, reject);
          }
          if (table === 'action_journal')
            return Promise.resolve({
              data: [{ id: journal.length + 1 }],
              error: null,
            }).then(resolve, reject);
          if (table === 'cleaner_action_targets')
            return Promise.resolve({ data: [], error: null }).then(
              resolve,
              reject,
            );
          return Promise.resolve({ data: [], error: null }).then(
            resolve,
            reject,
          );
        },
      };
      return chain;
    },
  };
  return client;
}

function makeContext(items, overrides = {}) {
  const supabase = overrides.supabase || makeSupabase();
  return {
    user: { id: '11111111-1111-4111-8111-111111111111' },
    role: 'commercial',
    sfUserId: '005000000000001',
    teamSfUserIds: ['005000000000001'],
    supabase,
    today: '2026-07-12',
    settings: { key: 'cleaner_v2', settings: { amountImplausibleMax: 100 } },
    loadOpportunityWorkspace: vi
      .fn()
      .mockResolvedValue({ items, nextCursor: null }),
    fetchSFToken: vi.fn().mockResolvedValue({ accessToken: 'user-token' }),
    updateSObjects: vi.fn().mockResolvedValue({
      records: items.map((item) => ({
        id: item.id,
        success: true,
        errors: [],
      })),
    }),
    journalCleanerAction: vi
      .fn()
      .mockResolvedValue({ data: { id: 99 }, error: null }),
    ...overrides,
  };
}

async function previewFor(
  ctx,
  ids = [ID(1)],
  changes = { close_date: '2026-08-01' },
) {
  return previewOpportunityCommand(ctx, { ids, changes });
}

describe('executeOpportunityCommand', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('does not write Salesforce when the preview is stale', async () => {
    const item = opportunity(ID(1));
    const ctx = makeContext([item]);
    const preview = await previewFor(ctx);
    ctx.loadOpportunityWorkspace.mockResolvedValue({
      items: [{ ...item, close_date: '2026-01-01' }],
      nextCursor: null,
    });

    await expect(
      executeOpportunityCommand(ctx, {
        previewId: preview.previewId,
        fingerprint: preview.fingerprint,
        idempotencyKey: 'idem-stale',
      }),
    ).rejects.toMatchObject({ code: 'stale_preview', status: 409 });
    expect(ctx.updateSObjects).not.toHaveBeenCalled();
  });

  it('replays an exact duplicate key without a second Salesforce write', async () => {
    const ctx = makeContext([opportunity(ID(2))]);
    const preview = await previewFor(ctx, [ID(2)]);
    const input = {
      previewId: preview.previewId,
      fingerprint: preview.fingerprint,
      idempotencyKey: 'idem-replay',
    };
    const first = await executeOpportunityCommand(ctx, input);
    const second = await executeOpportunityCommand(ctx, input);

    expect(second).toEqual(first);
    expect(ctx.updateSObjects).toHaveBeenCalledTimes(1);
  });

  it('reports an idempotency collision explicitly', async () => {
    const supabase = makeSupabase();
    const ctx = makeContext([opportunity(ID(3))], { supabase });
    const preview = await previewFor(ctx, [ID(3)]);
    supabase.commands.push({
      id: 99,
      actor: ctx.user.id,
      idempotency_key: 'idem-collision',
      fingerprint: 'other',
      status: 'succeeded',
      result: { status: 'succeeded' },
    });

    await expect(
      executeOpportunityCommand(ctx, {
        previewId: preview.previewId,
        fingerprint: preview.fingerprint,
        idempotencyKey: 'idem-collision',
      }),
    ).rejects.toMatchObject({ code: 'idempotency_collision', status: 409 });
  });

  it('chunks writes at 200 and aggregates partial Salesforce results', async () => {
    const items = Array.from({ length: 405 }, (_, index) =>
      opportunity(ID(index + 10)),
    );
    const ctx = makeContext(items);
    ctx.updateSObjects.mockImplementation(async (_token, _object, records) => ({
      records: records.map((item, index) => ({
        id: item.id,
        success: index % 2 === 0,
        errors: index % 2 === 0 ? [] : [{ message: 'Validation failed' }],
      })),
    }));
    const preview = await previewFor(
      ctx,
      items.map((item) => item.id),
    );
    const result = await executeOpportunityCommand(ctx, {
      previewId: preview.previewId,
      fingerprint: preview.fingerprint,
      idempotencyKey: 'idem-batches',
    });

    expect(ctx.updateSObjects.mock.calls.map((call) => call[2].length)).toEqual(
      [200, 200, 5],
    );
    expect(ctx.updateSObjects.mock.calls[0][2][0]).toEqual({
      id: items[0].id,
      CloseDate: '2026-08-01',
    });
    expect(result.updated).toBe(203);
    expect(result.failed).toBe(202);
    expect(result.status).toBe('partial');
    expect(result.results.find((row) => !row.success)).toMatchObject({
      error: 'Validation failed',
    });
    expect(
      ctx.supabase.commands.find((command) => command.id === 2),
    ).toMatchObject({ status: 'partial', result: { status: 'partial' } });
  });

  it('makes an audit failure explicit and persists the failed command result', async () => {
    const ctx = makeContext([opportunity(ID(4))], {
      journalCleanerAction: vi.fn().mockResolvedValue({
        data: null,
        error: { code: 'audit_unavailable', message: 'journal down' },
      }),
    });
    const preview = await previewFor(ctx, [ID(4)]);

    await expect(
      executeOpportunityCommand(ctx, {
        previewId: preview.previewId,
        fingerprint: preview.fingerprint,
        idempotencyKey: 'idem-audit',
      }),
    ).rejects.toMatchObject({
      code: 'audit_error',
      status: 502,
      details: expect.objectContaining({ auditError: 'journal down' }),
    });
    expect(
      ctx.supabase.commands.find((command) => command.id === 2),
    ).toMatchObject({
      status: 'failed',
      result: { auditError: 'journal down' },
    });
  });
});
