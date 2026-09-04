import { describe, expect, it, vi } from 'vitest';
import { listShared, createShared, revokeShared } from './shared.js';

// Minimal Supabase client mock for listShared (no .single(), chain awaited directly)
function makeListClient({ rows = [], listError = null, isManager = false }) {
  return {
    from: vi.fn((table) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: [] }),
          }),
        };
      }
      const chain = {};
      chain.select = vi.fn().mockReturnValue(chain);
      chain.is = vi.fn().mockReturnValue(chain);
      chain.order = vi.fn().mockReturnValue(chain);
      chain.or = vi.fn((filter) => {
        if (!isManager) {
          expect(filter).toContain('recipient_id.eq.');
          expect(filter).toContain('recipient_id.is.null');
        }
        return chain;
      });
      chain.then = (resolve) =>
        resolve({ data: listError ? null : rows, error: listError || null });
      return chain;
    }),
  };
}

// Mock for createShared / revokeShared (uses .single())
function makeMutationClient({ insertError = null, updateError = null } = {}) {
  return {
    from: vi.fn((table) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { id: 'some-id' }, error: null }),
        };
      }
      if (table !== 'shared_analyses') throw new Error('unexpected table ' + table);
      const builder = {
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        single: vi.fn().mockImplementation(() => {
          if (insertError) return Promise.resolve({ data: null, error: insertError });
          if (updateError) return Promise.resolve({ data: null, error: updateError });
          return Promise.resolve({ data: { id: 'row-1' }, error: null });
        }),
      };
      return builder;
    }),
  };
}

describe('shared.js', () => {
  describe('listShared', () => {
    it('returns analyses for a manager (no .or filter applied)', async () => {
      const client = makeListClient({
        rows: [{ id: 'a', recipient_id: null }],
        isManager: true,
      });
      const result = await listShared(client, 'user-1', 'manager');
      expect(result.analyses).toEqual([{ id: 'a', recipient_id: null, created_by_label: 'Inconnu' }]);
      expect(result.error).toBeUndefined();
    });

    it('filters by recipient_id OR NULL for a commercial', async () => {
      const client = makeListClient({
        rows: [{ id: 'a', recipient_id: 'user-1' }],
        isManager: false,
      });
      const result = await listShared(client, 'user-1', 'commercial');
      expect(result.analyses).toEqual([{ id: 'a', recipient_id: 'user-1', created_by_label: 'Inconnu' }]);
    });

    it('returns 500 on lookup error', async () => {
      const client = makeListClient({ listError: { message: 'boom' } });
      const result = await listShared(client, 'user-1', 'manager');
      expect(result.error).toBe('shared_lookup_failed');
      expect(result.status).toBe(500);
    });

    it('always filters by revoked_at IS NULL (contract with migration 036)', async () => {
      const client = makeListClient({ rows: [], isManager: true });
      await listShared(client, 'user-1', 'manager');
      const chain = client.from.mock.results[0].value;
      // Non-vacuous: assert the call happened, not just iterate over empty array.
      expect(chain.is).toHaveBeenCalledWith('revoked_at', null);
    });
  });

  describe('createShared', () => {
    it('validates config is an object', async () => {
      const client = makeMutationClient();
      const result = await createShared({
        client,
        userId: 'user-1',
        config: null,
      });
      expect(result.error).toBe('invalid_config');
      expect(result.status).toBe(400);
    });

    it('requires granularity and period in config', async () => {
      const client = makeMutationClient();
      const result = await createShared({
        client,
        userId: 'user-1',
        config: { granularity: 'year' },
      });
      expect(result.error).toBe('config_missing_granularity_or_period');
    });

    it('inserts and returns analysis on success', async () => {
      const client = makeMutationClient();
      const result = await createShared({
        client,
        userId: 'user-1',
        config: { granularity: 'year', period: 'FY26' },
        note: 'test',
      });
      expect(result.analysis).toEqual({ id: 'row-1' });
    });
  });

  describe('revokeShared', () => {
    it('sets revoked_at to an ISO timestamp string', async () => {
      const client = makeMutationClient();
      const result = await revokeShared(client, 'user-1', 'analysis-1');
      expect(result.revoked).toBe('row-1');
      const fromMock = client.from.mock.results[0].value;
      expect(fromMock.update).toHaveBeenCalled();
      const updateArg = fromMock.update.mock.calls[0][0];
      expect(updateArg.revoked_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('returns 404 on PGRST116 (not found or not owner)', async () => {
      const client = makeMutationClient({ updateError: { code: 'PGRST116' } });
      const result = await revokeShared(client, 'user-1', 'missing');
      expect(result.error).toBe('not_found_or_not_owner');
      expect(result.status).toBe(404);
    });
  });
});