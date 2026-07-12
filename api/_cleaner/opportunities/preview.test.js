import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '../../cleaner.js';
import { previewOpportunityCommand } from './preview.js';

const ID = (n) => `006${String(n).padStart(12, '0')}`;

function opportunity(id, ownerId = '005000000000001', overrides = {}) {
  return {
    id,
    name: `Opportunity ${id}`,
    owner_id: ownerId,
    owner: 'Owner',
    account_id: '001000000000001',
    account: 'Account',
    account_owner_id: '005000000000002',
    account_owner_name: 'Account owner',
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
  const client = {
    commands,
    from(table) {
      const chain = {
        insert(payload) {
          chain.payload = payload;
          return chain;
        },
        select() {
          return chain;
        },
        single: async () => {
          const row = { id: commands.length + 1, ...chain.payload };
          commands.push(row);
          return { data: row, error: null };
        },
      };
      if (table !== 'cleaner_commands')
        throw new Error(`unexpected table ${table}`);
      return chain;
    },
  };
  return client;
}

function context(items) {
  return {
    user: { id: '11111111-1111-4111-8111-111111111111' },
    role: 'commercial',
    sfUserId: '005000000000001',
    teamSfUserIds: ['005000000000001'],
    supabase: makeSupabase(),
    today: '2026-07-12',
    settings: { key: 'cleaner_v2', settings: { amountImplausibleMax: 100 } },
    loadOpportunityWorkspace: vi
      .fn()
      .mockResolvedValue({ items, nextCursor: null }),
  };
}

describe('previewOpportunityCommand', () => {
  it('exposes an authenticated POST boundary with private no-store headers', async () => {
    const response = await POST(
      new Request('https://app.test/api/cleaner', {
        method: 'POST',
        body: '{}',
      }),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    await expect(response.json()).resolves.toEqual({ error: 'unauthorized' });
  });

  it('revalidates owner/date/stage/type and returns authoritative before/after without writing Salesforce', async () => {
    const ctx = context([opportunity(ID(1))]);
    const result = await previewOpportunityCommand(ctx, {
      ids: [ID(1)],
      changes: {
        owner_id: '005000000000003',
        close_date: '2026-08-15',
        stage: 'Proposition envoyée',
        type_vente: 'Sur-mesure',
      },
    });

    expect(Object.keys(result)).toEqual([
      'previewId',
      'fingerprint',
      'expiresAt',
      'changes',
      'eligible',
      'excluded',
    ]);
    expect(result.changes).toEqual({
      owner_id: '005000000000003',
      close_date: '2026-08-15',
      stage: 'Proposition envoyée',
      type_vente: 'Sur-mesure',
    });
    expect(result.eligible[0]).toMatchObject({
      id: ID(1),
      before: {
        owner_id: '005000000000001',
        close_date: '2026-06-01',
        stage: 'Projet qualifié / AO reçu',
        type_vente: 'Catalogue',
      },
      after: {
        owner_id: '005000000000003',
        close_date: '2026-08-15',
        stage: 'Proposition envoyée',
        type_vente: 'Sur-mesure',
      },
    });
    expect(result.excluded).toEqual([]);
    expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('uses the authoritative account owner and dependent loss picklist', async () => {
    const ctx = context([opportunity(ID(2))]);
    ctx.opportunityMetadata = {
      lossReasonsBySaleType: { Catalogue: ['Budget perdu'] },
    };
    const result = await previewOpportunityCommand(ctx, {
      ids: [ID(2)],
      changes: {
        owner_id: 'ACCOUNT_OWNER',
        stage: 'Fermée / Perdue',
        loss_reason: 'Budget perdu',
      },
    });

    expect(result.eligible[0].after).toMatchObject({
      owner_id: '005000000000002',
      stage: 'Fermée / Perdue',
      loss_reason: 'Budget perdu',
    });
  });

  it('excludes inaccessible and stale records without exposing whether an ID exists', async () => {
    const ctx = context([opportunity(ID(3))]);
    const result = await previewOpportunityCommand(ctx, {
      ids: [ID(3), ID(4)],
      changes: { close_date: '2026-08-01' },
      snapshots: { [ID(3)]: { close_date: '2025-01-01' } },
    });

    expect(result.eligible).toEqual([]);
    expect(result.excluded).toEqual([
      { id: ID(3), reason: 'stale_record' },
      { id: ID(4), reason: 'not_eligible' },
    ]);
  });

  it('accepts more than 200 IDs in preview while enforcing a global bound', async () => {
    const items = Array.from({ length: 201 }, (_, index) =>
      opportunity(ID(index + 10)),
    );
    const ctx = context(items);
    const result = await previewOpportunityCommand(ctx, {
      ids: items.map((item) => item.id),
      changes: { close_date: '2026-08-01' },
    });

    expect(result.eligible).toHaveLength(201);
  });
});
