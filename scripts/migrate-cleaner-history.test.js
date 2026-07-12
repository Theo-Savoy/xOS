import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  normalizeLegacyBlob,
  parseArgs,
  runMigration,
} from './migrate-cleaner-history.js';

const blobPayload = {
  at: '2026-07-01T10:00:00+02:00',
  changes: { stage: 'Gagné' },
  opps: [
    {
      id: '006000000000001',
      name: 'One',
      owner: 'Ada',
      success: true,
      error: null,
    },
    {
      id: '006000000000002',
      name: 'Two',
      owner: 'Bea',
      success: false,
      error: 'Salesforce refused',
    },
  ],
};

function blobApiFor(pages) {
  const listed = [];
  return {
    listed,
    async list({ cursor }) {
      listed.push(cursor || null);
      return pages[cursor || 'first'];
    },
    async get(pathname) {
      return new Response(
        JSON.stringify(
          pathname.endsWith('two.json') ? blobPayload : blobPayload,
        ),
      );
    },
  };
}

function clientFor() {
  const sourceIds = new Set();
  const calls = [];
  return {
    calls,
    sourceIds,
    from(table) {
      expect(['action_journal', 'cleaner_action_targets']).toContain(table);
      if (table === 'cleaner_action_targets') {
        return { insert: async () => ({ data: [], error: null }) };
      }
      return {
        insert(payload) {
          calls.push(payload);
          const row = Array.isArray(payload) ? payload[0] : payload;
          if (sourceIds.has(row.source_id)) {
            return {
              select: () => ({
                single: async () => ({
                  data: null,
                  error: { code: '23505', message: 'duplicate' },
                }),
              }),
            };
          }
          sourceIds.add(row.source_id);
          return {
            select: () => ({
              single: async () => ({
                data: { id: sourceIds.size },
                error: null,
              }),
            }),
          };
        },
      };
    },
  };
}

describe('legacy history importer', () => {
  it('normalizes one pathname into one action and one target per opportunity', () => {
    const result = normalizeLegacyBlob(
      'history/2026-07-01-one.json',
      blobPayload,
    );

    expect(result).toMatchObject({
      source: 'legacy_blob',
      moduleId: 'opportunities',
      actorLabel: 'Legacy CRM Cleaner',
      actionType: 'legacy_cleaner_action',
    });
    expect(result.sourceId).toEqual(expect.any(String));
    expect(result.targets).toHaveLength(2);
    expect(result.targets[1]).toMatchObject({
      sfRecordId: '006000000000002',
      success: false,
    });
  });

  it('lists all Blob pages and deduplicates repeated pathnames', async () => {
    const blobs = blobApiFor({
      first: {
        blobs: [
          { pathname: 'history/one.json' },
          { pathname: 'history/two.json' },
        ],
        hasMore: true,
        cursor: 'next',
      },
      next: {
        blobs: [
          { pathname: 'history/two.json' },
          { pathname: 'history/three.json' },
        ],
        hasMore: false,
      },
    });
    const client = clientFor();

    const result = await runMigration({
      args: ['--dry-run'],
      env: { BLOB_READ_WRITE_TOKEN: 'blob-token' },
      blobApi: blobs,
      client,
    });

    expect(blobs.listed).toEqual([null, 'next']);
    expect(result).toMatchObject({
      dryRun: true,
      source: { discovered: 3, normalized: 3 },
      target: { discovered: 6, inserted: 0 },
    });
    expect(client.calls).toEqual([]);
  });

  it('reports partial target failures and inserts zero rows on a second import', async () => {
    const pages = {
      first: { blobs: [{ pathname: 'history/one.json' }], hasMore: false },
    };
    const client = clientFor();
    const first = await runMigration({
      args: ['--apply'],
      env: { BLOB_READ_WRITE_TOKEN: 'blob-token' },
      blobApi: blobApiFor(pages),
      client,
    });
    const second = await runMigration({
      args: ['--apply'],
      env: { BLOB_READ_WRITE_TOKEN: 'blob-token' },
      blobApi: blobApiFor(pages),
      client,
    });

    expect(first).toMatchObject({
      dryRun: false,
      source: { inserted: 1 },
      target: { discovered: 2, failed: 1 },
    });
    expect(second).toMatchObject({
      source: { inserted: 0, skipped: 1 },
      target: { inserted: 0 },
    });
    expect(client.calls).toHaveLength(2);
    expect(first.exitCode).toBe(0);
    expect(second.exitCode).toBe(0);
  });

  it('defaults to dry-run, supports limit, and blocks before any network call without env', async () => {
    const calls = [];
    const result = await runMigration({
      args: ['--limit', '2'],
      env: {},
      blobApi: {
        list: async () => {
          calls.push('list');
        },
        get: async () => {
          calls.push('get');
        },
      },
      client: {
        from: () => {
          calls.push('supabase');
        },
      },
    });

    expect(parseArgs([])).toMatchObject({ dryRun: true, limit: null });
    expect(parseArgs(['--limit', '2'])).toMatchObject({
      dryRun: true,
      limit: 2,
    });
    expect(result).toMatchObject({
      blocked: true,
      dryRun: true,
      reason: expect.stringContaining('BLOB_READ_WRITE_TOKEN'),
    });
    expect(calls).toEqual([]);
  });

  it('asserts the migration contains metadata, constraints, indexes and RLS policies', async () => {
    const sql = await readFile(
      new URL('../supabase/migrations/021_cleaner_v2.sql', import.meta.url),
      'utf8',
    );

    const compact = sql.toLowerCase().replace(/\s+/g, ' ');
    for (const fragment of [
      'alter table public.action_journal alter column actor drop not null',
      'source_id',
      'module_id',
      'command_id',
      'idempotency_key',
      'create table if not exists public.cleaner_commands',
      'create table if not exists public.cleaner_action_targets',
      'unique (actor, idempotency_key)',
      'enable row level security',
      'to service_role',
      'idx_action_journal_module_at',
      'idx_cleaner_action_targets_owner',
    ]) {
      expect(compact).toContain(fragment);
    }
  });
});
