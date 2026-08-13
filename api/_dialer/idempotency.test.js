// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { checkAndRecordWebhook, extractEventId } from './idempotency.js';

const RAW = JSON.stringify({ data: { id: 'evt_abc', event_type: 'call.hangup' } });

describe('extractEventId', () => {
  it('est déterministe : deux livraisons du même event → même clé', () => {
    expect(extractEventId(RAW)).toBe(extractEventId(RAW));
  });

  it('utilise data.id quand il est présent', () => {
    expect(extractEventId(RAW)).toBe('evt_abc');
  });

  it('retombe sur un hash du corps, jamais sur de l’aléatoire', () => {
    const noId = JSON.stringify({ data: { event_type: 'call.hangup' } });
    expect(extractEventId(noId)).toBe(extractEventId(noId));
    expect(extractEventId(noId)).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('est stable sur un corps malformé (hash du raw body)', () => {
    expect(extractEventId('not-json')).toMatch(/^sha256:/);
  });
});

describe('checkAndRecordWebhook', () => {
  const clientReturning = (result) => ({
    from: () => ({ insert: () => ({ select: () => ({ maybeSingle: async () => result }) }) }),
  });

  it('signale un duplicat sur violation de PK (23505)', async () => {
    const r = await checkAndRecordWebhook(
      clientReturning({ data: null, error: { code: '23505' } }),
      { eventId: 'evt_abc', eventType: 'call.hangup', payload: {} },
    );
    expect(r.isDuplicate).toBe(true);
  });

  it('propage les autres erreurs (pas de faux « nouveau »)', async () => {
    await expect(
      checkAndRecordWebhook(clientReturning({ data: null, error: { code: '42P01' } }), {
        eventId: 'evt_abc',
        eventType: 'call.hangup',
        payload: {},
      }),
    ).rejects.toThrow();
  });

  it('renvoie isDuplicate=false et le rowId sur un insert réussi', async () => {
    const r = await checkAndRecordWebhook(
      clientReturning({ data: { event_id: 'evt_abc' }, error: null }),
      { eventId: 'evt_abc', eventType: 'call.hangup', payload: {} },
    );
    expect(r).toEqual({ isDuplicate: false, rowId: 'evt_abc' });
  });


  it('utilise la claim RPC atomique et permet de reprendre un événement failed', async () => {
    const rpc = async () => ({ data: true, error: null });
    const r = await checkAndRecordWebhook(
      { rpc },
      { eventId: 'evt_retry', eventType: 'call.hangup', payload: { retry: true } },
    );
    expect(r).toEqual({ isDuplicate: false, isProcessing: false, rowId: 'evt_retry' });
  });

  it('distingue un duplicate terminal d’un événement encore sous lease', async () => {
    const query = (status) => {
      const chain = {
        select: () => chain, eq: () => chain,
        maybeSingle: async () => ({ data: { status }, error: null }),
      };
      return chain;
    };
    const terminal = await checkAndRecordWebhook(
      { rpc: async () => ({ data: false, error: null }), from: () => query('processed') },
      { eventId: 'evt_done', eventType: 'call.hangup', payload: {} },
    );
    expect(terminal).toEqual({ isDuplicate: true, isProcessing: false, rowId: null });
    const pending = await checkAndRecordWebhook(
      { rpc: async () => ({ data: false, error: null }), from: () => query('pending') },
      { eventId: 'evt_busy', eventType: 'call.hangup', payload: {} },
    );
    expect(pending).toEqual({ isDuplicate: false, isProcessing: true, rowId: null });
  });
});
