import { describe, expect, it } from 'vitest';
import { reserveCommand } from './idempotency.js';

function chainFor({ insert, lookup }) {
  const chain = {
    insert(payload) {
      chain.inserted = payload;
      return chain;
    },
    select(selection) {
      chain.selection = selection;
      return chain;
    },
    eq(field, value) {
      chain.filters ||= [];
      chain.filters.push([field, value]);
      return chain;
    },
    single: async () => insert,
    maybeSingle: async () => lookup,
  };
  return chain;
}

function clientFor({ insert, lookup }) {
  const calls = [];
  return {
    calls,
    from(table) {
      calls.push(table);
      return chainFor({ insert, lookup });
    },
  };
}

describe('reserveCommand', () => {
  it('atomically reserves a new command', async () => {
    const command = {
      id: 11,
      actor: 'actor-1',
      idempotency_key: 'idem-1',
      fingerprint: 'fp-1',
      status: 'reserved',
    };
    const client = clientFor({
      insert: { data: command, error: null },
      lookup: { data: null, error: null },
    });

    const result = await reserveCommand(client, {
      actorId: 'actor-1',
      idempotencyKey: 'idem-1',
      fingerprint: 'fp-1',
    });

    expect(result).toEqual({
      data: command,
      error: null,
      reserved: true,
      replay: false,
    });
  });

  it('replays the exact existing reservation without a second execution', async () => {
    const command = {
      id: 11,
      actor: 'actor-1',
      idempotency_key: 'idem-1',
      fingerprint: 'fp-1',
      status: 'succeeded',
    };
    const client = clientFor({
      insert: {
        data: null,
        error: { code: '23505', message: 'duplicate key' },
      },
      lookup: { data: command, error: null },
    });

    const result = await reserveCommand(client, {
      actorId: 'actor-1',
      idempotencyKey: 'idem-1',
      fingerprint: 'fp-1',
    });

    expect(result).toEqual({
      data: command,
      error: null,
      reserved: false,
      replay: true,
    });
  });

  it('refuses a key collision with a different fingerprint', async () => {
    const client = clientFor({
      insert: {
        data: null,
        error: { code: '23505', message: 'duplicate key' },
      },
      lookup: {
        data: { id: 11, fingerprint: 'other-fingerprint' },
        error: null,
      },
    });

    const result = await reserveCommand(client, {
      actorId: 'actor-1',
      idempotencyKey: 'idem-1',
      fingerprint: 'fp-1',
    });

    expect(result).toMatchObject({
      data: { id: 11, fingerprint: 'other-fingerprint' },
      reserved: false,
      replay: false,
      error: { code: 'idempotency_collision' },
    });
  });

  it('returns non-conflict Supabase errors to the caller', async () => {
    const supabaseError = { code: '42501', message: 'permission denied' };
    const result = await reserveCommand(
      clientFor({
        insert: { data: null, error: supabaseError },
        lookup: { data: null, error: null },
      }),
      {
        actorId: 'actor-1',
        idempotencyKey: 'idem-1',
        fingerprint: 'fp-1',
      },
    );

    expect(result).toEqual({
      data: null,
      error: supabaseError,
      reserved: false,
      replay: false,
    });
  });
});
