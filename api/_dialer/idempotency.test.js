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
});
