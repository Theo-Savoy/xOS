import { describe, expect, it, vi } from 'vitest';
import {
  journalCleanerAction,
  listCleanerHistory,
  sourceIdFromPathname,
} from './audit.js';

function resolvedChain(result, calls = []) {
  const chain = {
    insert(payload) {
      calls.push({ method: 'insert', payload });
      return chain;
    },
    select(selection) {
      calls.push({ method: 'select', selection });
      return chain;
    },
    eq(field, value) {
      calls.push({ method: 'eq', field, value });
      return chain;
    },
    in(field, values) {
      calls.push({ method: 'in', field, values });
      return chain;
    },
    order(field, options) {
      calls.push({ method: 'order', field, options });
      return chain;
    },
    range(from, to) {
      calls.push({ method: 'range', from, to });
      return chain;
    },
    single: async () => result,
    maybeSingle: async () => result,
    then(resolve, reject) {
      return Promise.resolve(result).then(resolve, reject);
    },
  };
  return chain;
}

function makeClient({
  journal = { data: [{ id: 42 }], error: null },
  targets = { data: [], error: null },
  history = [],
} = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      calls.push({ method: 'from', table });
      if (table === 'action_journal') {
        return resolvedChain(journal, calls);
      }
      return resolvedChain(targets, calls);
    },
    history,
  };
}

describe('journalCleanerAction', () => {
  it('normalizes metadata and inserts normalized Salesforce targets', async () => {
    const client = makeClient();

    const result = await journalCleanerAction(client, {
      actorId: 'actor-1',
      actionType: 'update_stage',
      source: 'labo',
      source_id: 'command-source',
      moduleId: 'opportunities',
      commandId: 7,
      idempotencyKey: 'idem-1',
      changes: { stage: 'Gagné' },
      targets: [
        {
          objectType: 'Opportunity',
          sfRecordId: '006000000000001',
          sfOwnerId: '005000000000001',
          before: { StageName: 'Prospection' },
          after: { StageName: 'Gagné' },
          success: true,
          error: null,
        },
      ],
      result: { updated: 1 },
    });

    expect(result).toEqual({ data: [{ id: 42 }], error: null });
    expect(client.calls).toContainEqual({
      method: 'insert',
      payload: {
        actor: 'actor-1',
        actor_label: null,
        action_type: 'update_stage',
        changes: { stage: 'Gagné' },
        targets: [],
        result: { updated: 1 },
        source: 'labo',
        source_id: 'command-source',
        module_id: 'opportunities',
        command_id: 7,
        idempotency_key: 'idem-1',
      },
    });
    expect(client.calls).toContainEqual({
      method: 'insert',
      payload: [
        {
          action_journal_id: 42,
          object_type: 'Opportunity',
          sf_record_id: '006000000000001',
          sf_owner_id: '005000000000001',
          before_state: { StageName: 'Prospection' },
          after_state: { StageName: 'Gagné' },
          success: true,
          error: null,
        },
      ],
    });
  });

  it('refuses an actor-less new action before touching Supabase', async () => {
    const client = makeClient();

    const result = await journalCleanerAction(client, {
      actionType: 'update_stage',
      source: 'labo',
    });

    expect(result).toMatchObject({
      data: null,
      error: { code: 'actor_required' },
    });
    expect(client.calls).toEqual([]);
  });

  it('returns Supabase journal errors without swallowing them', async () => {
    const supabaseError = { code: '42501', message: 'permission denied' };
    const client = makeClient({
      journal: { data: null, error: supabaseError },
    });

    await expect(
      journalCleanerAction(client, {
        actorId: 'actor-1',
        actionType: 'update_stage',
      }),
    ).resolves.toEqual({ data: null, error: supabaseError });
  });
});

describe('listCleanerHistory', () => {
  it('paginates and masks actor-less imports from commercial history', async () => {
    const client = makeClient();
    client.from = vi.fn((table) => {
      if (table !== 'action_journal')
        return resolvedChain({ data: [], error: null }, client.calls);
      return resolvedChain(
        {
          data: [
            {
              id: 3,
              actor: 'actor-1',
              at: '2026-07-03T00:00:00Z',
              cleaner_action_targets: [],
            },
            {
              id: 2,
              actor: 'actor-1',
              at: '2026-07-02T00:00:00Z',
              cleaner_action_targets: [],
            },
            {
              id: 1,
              actor: null,
              actor_label: 'Legacy CRM Cleaner',
              at: '2026-07-01T00:00:00Z',
              cleaner_action_targets: [],
            },
          ],
          error: null,
        },
        client.calls,
      );
    });

    const result = await listCleanerHistory(client, {
      actorId: 'actor-1',
      role: 'commercial',
      sfOwnerId: '005000000000001',
      limit: 1,
    });

    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(1);
    expect(result.data[0].actor).toBe('actor-1');
    expect(result.nextCursor).toEqual(expect.any(String));
    expect(client.calls).toContainEqual({ method: 'range', from: 0, to: 2 });
  });

  it('keeps legacy imports available to manager history', async () => {
    const client = makeClient();
    client.from = vi.fn(() =>
      resolvedChain(
        {
          data: [
            {
              id: 9,
              actor: null,
              actor_label: 'Legacy CRM Cleaner',
              cleaner_action_targets: [],
            },
          ],
          error: null,
        },
        client.calls,
      ),
    );

    const result = await listCleanerHistory(client, {
      actorId: 'manager-1',
      role: 'manager',
      limit: 50,
    });

    expect(result.error).toBeNull();
    expect(result.data).toEqual([
      expect.objectContaining({
        actor: null,
        actor_label: 'Legacy CRM Cleaner',
      }),
    ]);
  });
});

describe('sourceIdFromPathname', () => {
  it('is deterministic and changes when the pathname changes', () => {
    expect(sourceIdFromPathname('history/one.json')).toBe(
      sourceIdFromPathname('history/one.json'),
    );
    expect(sourceIdFromPathname('history/one.json')).not.toBe(
      sourceIdFromPathname('history/two.json'),
    );
  });
});
