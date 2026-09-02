// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadDialerConfig: vi.fn(), loadUserEntitlements: vi.fn(), reserveBudget: vi.fn(),
  releaseReservation: vi.fn(), openCallRow: vi.fn(), closeCallRow: vi.fn(),
  dialContact: vi.fn(), getTelephonyCredential: vi.fn(), hangupCall: vi.fn(),
}));
vi.mock('./config.js', () => ({ loadDialerConfig: mocks.loadDialerConfig }));
vi.mock('./budget.js', () => ({
  loadUserEntitlements: mocks.loadUserEntitlements,
  reserveBudget: mocks.reserveBudget,
  releaseReservation: mocks.releaseReservation,
}));
vi.mock('./persistence.js', () => ({
  openCallRow: mocks.openCallRow, closeCallRow: mocks.closeCallRow, maskE164: (value) => value,
}));
vi.mock('./telnyx.js', () => ({
  dialContact: mocks.dialContact, getTelephonyCredential: mocks.getTelephonyCredential,
  hangupCall: mocks.hangupCall,
}));
import { hangupPool, processPoolWebhook, startPool } from './pool.js';

function thenable(result = { data: null, error: null }) {
  const chain = {
    select: vi.fn(() => chain), insert: vi.fn(() => chain), update: vi.fn(() => chain),
    eq: vi.fn(() => chain), neq: vi.fn(() => chain), is: vi.fn(() => chain),
    in: vi.fn(() => chain), order: vi.fn(() => chain), limit: vi.fn(() => chain),
    single: vi.fn(async () => result), maybeSingle: vi.fn(async () => result),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}
const encodeState = (state) => Buffer.from(JSON.stringify(state)).toString('base64');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadDialerConfig.mockReturnValue({
    apiKey: 'unit-test-key', connectionId: 'conn-1', callerId: '+339****0000',
    webhookPublicKey: 'test-webhook-public-key', isDryRun: false,
  });
  mocks.loadUserEntitlements.mockResolvedValue({
    enabled: true, dryRun: false, budgetDayCents: 1000, callsDayLimit: 50,
    callsMonthLimit: 500, telnyxCredentialId: 'cred-1',
  });
  mocks.reserveBudget.mockResolvedValue({ allowed: true, reservationId: 'res-1' });
  mocks.releaseReservation.mockResolvedValue(undefined);
  mocks.closeCallRow.mockResolvedValue({ closed: true });
  mocks.getTelephonyCredential.mockResolvedValue({ sipUsername: 'agent-user' });
  mocks.hangupCall.mockResolvedValue({ ok: true });
});

function winnerClient({
  claimed = true,
  status = 'connecting',
  postDialStatus = status,
  agentUpdated = true,
  agentCallControlId = null,
  failUpdateError = null,
} = {}) {
  const call = thenable({ data: {
    id: 2, owner_user_id: 'user-1', pool_session_id: 'pool-1',
    telnyx_call_id: 'cc-winner', status: 'answered',
  }, error: null });
  const amd = thenable();
  const losers = thenable({ data: [
    { id: 1, telnyx_call_id: 'cc-loser-1', owner_user_id: 'user-1', status: 'ringing' },
    { id: 3, telnyx_call_id: 'cc-loser-3', owner_user_id: 'user-1', status: 'answered' },
  ], error: null });
  const liveSession = thenable({ data: {
    status, winner_call_id: 2, agent_call_control_id: agentCallControlId,
  }, error: null });
  const postDialSession = thenable({ data: { status: postDialStatus, winner_call_id: 2 }, error: null });
  const sessionUpdate = thenable({ data: agentUpdated ? [{ id: 'pool-1' }] : [], error: null });
  const failUpdate = thenable({ data: null, error: failUpdateError });
  let callsUse = 0;
  let sessionsUse = 0;
  return {
    failUpdate,
    rpc: vi.fn(async () => ({
      data: status === 'cancelling' ? 'inactive' : (claimed ? 'claimed' : 'loser'),
      error: null,
    })),
    from: vi.fn((table) => {
      if (table === 'dialer_pool_sessions') {
        return [liveSession, postDialSession, sessionUpdate, failUpdate][sessionsUse++] ?? failUpdate;
      }
      return [call, amd, losers][callsUse++];
    }),
  };
}

describe('webhookUrl', () => {
  const savedEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it('utilise l’alias stable en production, jamais l’URL de déploiement éphémère', async () => {
    process.env.NODE_ENV = 'production';
    process.env.VERCEL_ENV = 'production';
    process.env.VERCEL_URL = 'xos-dead-12345.vercel.app';
    process.env.TELNYX_ENV = 'dev'; // la prod Vercel tourne avec les vars *_DEV
    const { webhookUrl } = await import('./pool.js');
    expect(webhookUrl()).toBe('https://xos-dechet-repo.vercel.app/api/dialer?resource=webhooks');
  });

  it('garde l’URL de déploiement en dev (tunnel / preview)', async () => {
    process.env.NODE_ENV = 'development';
    process.env.VERCEL_ENV = 'preview';
    process.env.VERCEL_URL = 'xos-preview-abc.vercel.app';
    process.env.TELNYX_ENV = 'dev';
    const { webhookUrl } = await import('./pool.js');
    expect(webhookUrl()).toBe('https://xos-preview-abc.vercel.app/api/dialer?resource=webhooks');
  });

  it('retombe sur l’alias stable si aucune URL Vercel', async () => {
    process.env.NODE_ENV = 'development';
    process.env.VERCEL_ENV = '';
    delete process.env.VERCEL_URL;
    const { webhookUrl } = await import('./pool.js');
    expect(webhookUrl()).toBe('https://xos-dechet-repo.vercel.app/api/dialer?resource=webhooks');
  });
});

describe('startPool', () => {
  it('refuse tout appel réel lorsque la vérification webhook est absente', async () => {
    mocks.loadDialerConfig.mockReturnValue({
      apiKey: 'unit-test-key', connectionId: 'conn-1', callerId: ['+33', '900000000'].join(''),
      webhookPublicKey: null, isDryRun: false,
    });
    const client = { from: vi.fn() };
    const result = await startPool({
      client, user: { id: 'user-1' },
      flags: { dryRun: false, budgetSessionCents: 300, budgetOrgMonthCents: 15000 },
      body: { destinations: [['+33', '100000001'].join('')], parallelism: 1 },
    });
    expect(result).toEqual({ status: 503, body: { error: 'power_dialer_not_configured' } });
    expect(mocks.dialContact).not.toHaveBeenCalled();
    expect(client.from).not.toHaveBeenCalled();
  });

  it('retourne 409 lorsqu’une session active concurrente existe déjà', async () => {
    const pool = thenable({ data: null, error: { code: '23505', message: 'duplicate' } });
    const client = { from: vi.fn(() => pool) };
    const result = await startPool({
      client, user: { id: 'user-1' },
      flags: { dryRun: false, budgetSessionCents: 300, budgetOrgMonthCents: 15000 },
      body: { destinations: [['+33', '100000001'].join('')], parallelism: 1 },
    });
    expect(result).toEqual({ status: 409, body: { error: 'power_pool_already_active' } });
    expect(mocks.reserveBudget).not.toHaveBeenCalled();
    expect(mocks.dialContact).not.toHaveBeenCalled();
  });

  it('lance réellement les legs prospects en parallèle', async () => {
    const pool = thenable({ data: { id: 'pool-1' }, error: null });
    const update = thenable();
    const client = { from: vi.fn((table) => table === 'dialer_pool_sessions' ? pool : update) };
    mocks.openCallRow.mockImplementation(async (_client, { poolSlot }) => ({ id: poolSlot + 1 }));
    let active = 0;
    let peak = 0;
    const releases = [];
    mocks.dialContact.mockImplementation(async ({ to }) => {
      active += 1; peak = Math.max(peak, active);
      await new Promise((resolve) => releases.push(resolve));
      active -= 1;
      return { call_control_id: `cc-${to}` };
    });
    const pending = startPool({
      client, user: { id: 'user-1' },
      flags: { dryRun: false, budgetSessionCents: 300, budgetOrgMonthCents: 15000 },
      body: { destinations: ['+3310000001', '+3310000002', '+3310000003'], parallelism: 3 },
    });
    await vi.waitFor(() => expect(mocks.dialContact).toHaveBeenCalledTimes(3));
    // F-09 : chaque ligne du registre porte le numéro sortant (outbound_number
    // est NOT NULL dans le schéma distant — sans lui l'INSERT échoue et le
    // serveur répond call_record_failed).
    expect(mocks.openCallRow).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        toNumber: '+3310000001',
        outboundNumber: expect.stringMatching(/^\+33/),
        poolSessionId: 'pool-1',
      }),
    );
    releases.forEach((release) => release());
    const result = await pending;
    expect(peak).toBe(3);
    expect(result.body.calls).toHaveLength(3);
  });

  it('raccroche le leg si la persistance post-dial échoue', async () => {
    const pool = thenable({ data: { id: 'pool-1' }, error: null });
    const update = thenable({ data: null, error: { message: 'db unavailable' } });
    const client = { from: vi.fn((table) => table === 'dialer_pool_sessions' ? pool : update) };
    mocks.openCallRow.mockResolvedValue({ id: 9 });
    mocks.dialContact.mockResolvedValue({ call_control_id: 'cc-orphan' });
    const result = await startPool({
      client, user: { id: 'user-1' },
      flags: { dryRun: false, budgetSessionCents: 300, budgetOrgMonthCents: 15000 },
      body: { destinations: ['+3310000001'], parallelism: 1 },
    });
    expect(result.body.calls[0].status).toBe('failed');
    expect(mocks.hangupCall).toHaveBeenCalledWith(expect.objectContaining({ callControlId: 'cc-orphan' }));
    expect(mocks.closeCallRow).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ callRecordId: 9 }));
  });

  it('attend les autres slots si une réservation rejette', async () => {
    const pool = thenable({ data: { id: 'pool-partial' }, error: null });
    const update = thenable();
    const client = { from: vi.fn((table) => table === 'dialer_pool_sessions' ? pool : update) };
    mocks.reserveBudget.mockRejectedValueOnce(new Error('budget down'))
      .mockResolvedValueOnce({ allowed: true, reservationId: 'res-2' });
    mocks.openCallRow.mockResolvedValue({ id: 2 });
    mocks.dialContact.mockResolvedValue({ call_control_id: 'cc-2' });
    const result = await startPool({
      client, user: { id: 'user-1' },
      flags: { dryRun: false, budgetSessionCents: 300, budgetOrgMonthCents: 15000 },
      body: { destinations: ['+3310000001', '+3310000002'], parallelism: 2 },
    });
    expect(result.body.session_id).toBe('pool-partial');
    expect(result.body.calls.map((call) => call.status)).toEqual(['failed', 'dialing']);
  });

  // Séance Combo : contact_ids alignés sur destinations → dialer_calls.contact_id
  // renseigné, donc pool_status peut rendre le contact gagnant au runner.
  function sessionClient({ ownedContactIds = [11, 12], owner = 'user-1' } = {}) {
    return {
      from: vi.fn((table) => {
        if (table === 'call_sessions') return thenable({ data: { id: 7, owner }, error: null });
        if (table === 'call_session_contacts') {
          return thenable({ data: ownedContactIds.map((id) => ({ id })), error: null });
        }
        if (table === 'dialer_pool_sessions') return thenable({ data: { id: 'pool-1' }, error: null });
        return thenable();
      }),
    };
  }

  const sessionBody = (extra = {}) => ({
    destinations: ['+3310000001', '+3310000002'], parallelism: 2,
    session_id: 7, contact_ids: [11, 12], ...extra,
  });
  const flags = { dryRun: false, budgetSessionCents: 300, budgetOrgMonthCents: 15000 };

  it('rattache chaque ligne au contact de séance correspondant', async () => {
    const client = sessionClient();
    mocks.openCallRow.mockImplementation(async (_client, { poolSlot }) => ({ id: poolSlot + 1 }));
    mocks.dialContact.mockResolvedValue({ call_control_id: 'cc-1' });
    const result = await startPool({ client, user: { id: 'user-1' }, flags, body: sessionBody() });
    expect(result.status).toBe(200);
    expect(mocks.openCallRow).toHaveBeenCalledWith(
      expect.anything(), expect.objectContaining({ toNumber: '+3310000001', contactId: 11 }),
    );
    expect(mocks.openCallRow).toHaveBeenCalledWith(
      expect.anything(), expect.objectContaining({ toNumber: '+3310000002', contactId: 12 }),
    );
  });

  it('refuse un contact qui n’appartient pas à la séance, sans composer', async () => {
    const client = sessionClient({ ownedContactIds: [11] });
    const result = await startPool({ client, user: { id: 'user-1' }, flags, body: sessionBody() });
    expect(result).toEqual({ status: 403, body: { error: 'contact_not_in_session' } });
    expect(mocks.dialContact).not.toHaveBeenCalled();
    expect(mocks.reserveBudget).not.toHaveBeenCalled();
  });

  it('refuse une séance dont l’utilisateur n’est ni propriétaire ni membre', async () => {
    const client = {
      from: vi.fn((table) => (table === 'call_sessions'
        ? thenable({ data: { id: 7, owner: 'someone-else' }, error: null })
        : thenable({ data: null, error: null }))),
    };
    const result = await startPool({ client, user: { id: 'user-1' }, flags, body: sessionBody() });
    expect(result).toEqual({ status: 403, body: { error: 'session_access_denied' } });
    expect(mocks.dialContact).not.toHaveBeenCalled();
  });

  it('rejette des contact_ids non alignés sur les destinations', async () => {
    const client = { from: vi.fn() };
    const result = await startPool({
      client, user: { id: 'user-1' }, flags, body: sessionBody({ contact_ids: [11] }),
    });
    expect(result).toEqual({ status: 400, body: { error: 'invalid_contact_ids' } });
    expect(client.from).not.toHaveBeenCalled();
  });

  it('rejette des contact_ids en double (association numéro↔fiche ambiguë)', async () => {
    const client = { from: vi.fn() };
    const result = await startPool({
      client, user: { id: 'user-1' }, flags, body: sessionBody({ contact_ids: [11, 11] }),
    });
    expect(result).toEqual({ status: 400, body: { error: 'invalid_contact_ids' } });
  });

  it('reste compatible sans contact_ids (PowerDialerView autonome)', async () => {
    const pool = thenable({ data: { id: 'pool-1' }, error: null });
    const client = { from: vi.fn((table) => (table === 'dialer_pool_sessions' ? pool : thenable())) };
    mocks.openCallRow.mockResolvedValue({ id: 1 });
    mocks.dialContact.mockResolvedValue({ call_control_id: 'cc-1' });
    await startPool({
      client, user: { id: 'user-1' }, flags,
      body: { destinations: ['+3310000001'], parallelism: 1 },
    });
    expect(mocks.openCallRow).toHaveBeenCalledWith(
      expect.anything(), expect.objectContaining({ contactId: null }),
    );
    expect(client.from).not.toHaveBeenCalledWith('call_sessions');
  });

  it('compose depuis le numéro sortant choisi quand il appartient au compte', async () => {
    const owned = thenable({ data: { e164: '+33184800001' }, error: null });
    const pool = thenable({ data: { id: 'pool-1' }, error: null });
    const client = {
      from: vi.fn((table) => {
        if (table === 'dialer_phone_numbers') return owned;
        if (table === 'dialer_pool_sessions') return pool;
        return thenable();
      }),
    };
    mocks.openCallRow.mockResolvedValue({ id: 1 });
    mocks.dialContact.mockResolvedValue({ call_control_id: 'cc-1' });

    await startPool({
      client, user: { id: 'user-1' }, flags,
      body: {
        destinations: ['+3310000001'], parallelism: 1,
        caller_number: '+33184800001',
      },
    });

    expect(mocks.openCallRow).toHaveBeenCalledWith(
      expect.anything(), expect.objectContaining({ outboundNumber: '+33184800001' }),
    );
    expect(mocks.dialContact).toHaveBeenCalledWith(
      expect.objectContaining({ from: '+33184800001', to: '+3310000001' }),
    );
  });

  it('refuse un numéro sortant qui n’appartient pas au compte', async () => {
    const client = { from: vi.fn(() => thenable({ data: null, error: null })) };
    const result = await startPool({
      client, user: { id: 'user-1' }, flags,
      body: {
        destinations: ['+3310000001'], parallelism: 1,
        caller_number: '+33999999999',
      },
    });
    expect(result).toEqual({ status: 403, body: { error: 'caller_number_not_owned' } });
    expect(mocks.dialContact).not.toHaveBeenCalled();
  });

  it('ne compose jamais en dry-run, même avec une séance valide', async () => {
    mocks.loadUserEntitlements.mockResolvedValue({
      enabled: true, dryRun: true, budgetDayCents: 1000, callsDayLimit: 50,
      callsMonthLimit: 500, telnyxCredentialId: 'cred-1',
    });
    const client = { from: vi.fn() };
    const result = await startPool({ client, user: { id: 'user-1' }, flags, body: sessionBody() });
    expect(result).toEqual({ status: 200, body: { dry_run: true, session_id: null, calls: [] } });
    expect(mocks.dialContact).not.toHaveBeenCalled();
    expect(client.from).not.toHaveBeenCalled();
  });
});

describe('winner takes all', () => {
  it('raccroche tous les losers avant de composer le poste agent', async () => {
    const client = winnerClient();
    mocks.dialContact.mockResolvedValue({ call_control_id: 'cc-agent' });
    const result = await processPoolWebhook({
      client, eventType: 'call.machine.premium.detection.ended',
      payload: { client_state: encodeState({ callRecordId: 2, poolSessionId: 'pool-1' }), call_control_id: 'cc-winner', result: 'human' },
    });
    expect(result.result).toBe('winner');
    expect(mocks.hangupCall).toHaveBeenCalledTimes(2);
    expect(mocks.closeCallRow).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ callRecordId: 3, answered: true }));
    expect(mocks.hangupCall.mock.invocationCallOrder[1]).toBeLessThan(mocks.dialContact.mock.invocationCallOrder[0]);
  });

  it('reprend le raccordement agent après un retry webhook du même winner', async () => {
    const client = winnerClient();
    client.rpc.mockResolvedValueOnce({ data: 'same', error: null });
    mocks.dialContact.mockResolvedValue({ call_control_id: 'cc-agent' });
    const result = await processPoolWebhook({
      client, eventType: 'call.machine.premium.detection.ended',
      payload: { client_state: encodeState({ callRecordId: 2, poolSessionId: 'pool-1' }), call_control_id: 'cc-winner', result: 'human' },
    });
    expect(result.result).toBe('winner');
    expect(mocks.dialContact).toHaveBeenCalledTimes(1);
  });

  it('ne recompose pas le poste agent si le même winner en possède déjà un', async () => {
    const client = winnerClient({ agentCallControlId: 'cc-agent-existing' });
    client.rpc.mockResolvedValueOnce({ data: 'same', error: null });
    const result = await processPoolWebhook({
      client, eventType: 'call.machine.premium.detection.ended',
      payload: { client_state: encodeState({ callRecordId: 2, poolSessionId: 'pool-1' }), call_control_id: 'cc-winner', result: 'human' },
    });
    expect(result.result).toBe('winner_already_connected');
    expect(mocks.dialContact).not.toHaveBeenCalled();
  });

  it('F-02 : retry AMD après active ne raccroche pas une conversation déjà bridgée', async () => {
    const client = winnerClient({ status: 'active', agentCallControlId: 'cc-agent-existing' });
    client.rpc.mockResolvedValueOnce({ data: 'same', error: null });
    const result = await processPoolWebhook({
      client, eventType: 'call.machine.premium.detection.ended',
      payload: { client_state: encodeState({ callRecordId: 2, poolSessionId: 'pool-1' }), call_control_id: 'cc-winner', result: 'human' },
    });
    expect(result.result).toBe('winner_already_connected');
    // Le gagnant et son leg agent ne sont jamais raccrochés (conversation live).
    expect(mocks.dialContact).not.toHaveBeenCalled();
    expect(mocks.hangupCall).not.toHaveBeenCalledWith(expect.objectContaining({ callControlId: 'cc-winner' }));
    expect(mocks.hangupCall).not.toHaveBeenCalledWith(expect.objectContaining({ callControlId: 'cc-agent-existing' }));
    // Les losers (jamais élus) restent raccrochés — nettoyage idempotent.
    expect(mocks.hangupCall).toHaveBeenCalledWith(expect.objectContaining({ callControlId: 'cc-loser-1' }));
    expect(mocks.hangupCall).toHaveBeenCalledWith(expect.objectContaining({ callControlId: 'cc-loser-3' }));
    expect(client.failUpdate.update).not.toHaveBeenCalled();
  });

  it('conserve le leg agent si sa réponse passe la session active avant sa persistance', async () => {
    const client = winnerClient({ postDialStatus: 'active' });
    mocks.dialContact.mockResolvedValue({ call_control_id: 'cc-agent' });
    const result = await processPoolWebhook({
      client, eventType: 'call.machine.premium.detection.ended',
      payload: { client_state: encodeState({ callRecordId: 2, poolSessionId: 'pool-1' }), call_control_id: 'cc-winner', result: 'human' },
    });
    expect(result.result).toBe('winner');
    expect(mocks.hangupCall).toHaveBeenCalledTimes(2);
    expect(mocks.hangupCall).not.toHaveBeenCalledWith(expect.objectContaining({ callControlId: 'cc-agent' }));
  });

  it('raccroche le leg agent et le winner si le CAS de persistance perd la course', async () => {
    const client = winnerClient({ agentUpdated: false });
    mocks.dialContact.mockResolvedValue({ call_control_id: 'cc-agent' });
    await expect(processPoolWebhook({
      client, eventType: 'call.machine.premium.detection.ended',
      payload: { client_state: encodeState({ callRecordId: 2, poolSessionId: 'pool-1' }), call_control_id: 'cc-winner', result: 'human' },
    })).rejects.toThrow('pool cancelled during agent persistence');
    expect(mocks.hangupCall).toHaveBeenCalledWith(expect.objectContaining({ callControlId: 'cc-agent' }));
    expect(mocks.hangupCall).toHaveBeenCalledWith(expect.objectContaining({ callControlId: 'cc-winner' }));
    expect(client.failUpdate.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }));
    expect(client.failUpdate.in).toHaveBeenCalledWith('status', ['dialing', 'connecting', 'active']);
    expect(mocks.closeCallRow).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ callRecordId: 2, status: 'failed' }),
    );
  });

  it('ne ferme pas le second humain si son hangup est incertain', async () => {
    const client = winnerClient({ claimed: false });
    mocks.hangupCall.mockRejectedValueOnce(new Error('timeout'));
    await expect(processPoolWebhook({
      client, eventType: 'call.machine.premium.detection.ended',
      payload: { client_state: encodeState({ callRecordId: 2, poolSessionId: 'pool-1' }), call_control_id: 'cc-second', result: 'human' },
    })).rejects.toThrow('timeout');
    expect(mocks.closeCallRow).not.toHaveBeenCalled();
  });

  it('ne compose pas le poste agent si une annulation a gagné', async () => {
    const client = winnerClient({ status: 'cancelling' });
    const result = await processPoolWebhook({
      client, eventType: 'call.machine.premium.detection.ended',
      payload: { client_state: encodeState({ callRecordId: 2, poolSessionId: 'pool-1' }), call_control_id: 'cc-winner', result: 'human' },
    });
    expect(result.result).toBe('inactive_session');
    expect(mocks.dialContact).not.toHaveBeenCalled();
  });

  it('passe réellement le winner à bridged seulement quand le leg agent répond', async () => {
    const lookup = thenable({ data: { winner_call_id: 2, status: 'connecting' }, error: null });
    const sessionUpdate = thenable();
    const winnerUpdate = thenable();
    let sessionUse = 0;
    const client = { from: vi.fn((table) => table === 'dialer_calls' ? winnerUpdate : [lookup, sessionUpdate][sessionUse++]) };
    const result = await processPoolWebhook({
      client, eventType: 'call.answered',
      payload: { client_state: encodeState({ poolSessionId: 'pool-1', kind: 'agent' }) },
    });
    expect(result.result).toBe('agent_active');
    expect(winnerUpdate.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'bridged' }));
  });
});

describe('hangupPool', () => {
  it('garde ligne et session réconciliables si Telnyx ne confirme pas le hangup', async () => {
    const session = thenable({ data: { agent_call_control_id: null }, error: null });
    const rows = thenable({ data: [{ id: 7, telnyx_call_id: 'cc-live', status: 'answered' }], error: null });
    const client = {
      rpc: vi.fn(async () => ({ data: true, error: null })),
      from: vi.fn((table) => table === 'dialer_pool_sessions' ? session : rows),
    };
    mocks.hangupCall.mockRejectedValueOnce(new Error('timeout'));
    const result = await hangupPool({ client, userId: 'user-1', sessionId: 'pool-1' });
    expect(result.status).toBe(502);
    expect(mocks.closeCallRow).not.toHaveBeenCalled();
    expect(session.update).not.toHaveBeenCalled();
  });

  it('ne finalise cancelled que depuis cancelling', async () => {
    const session = thenable({ data: { agent_call_control_id: null }, error: null });
    const rows = thenable({ data: [], error: null });
    const client = {
      rpc: vi.fn(async () => ({ data: true, error: null })),
      from: vi.fn((table) => table === 'dialer_pool_sessions' ? session : rows),
    };
    const result = await hangupPool({ client, userId: 'user-1', sessionId: 'pool-1' });
    expect(result.status).toBe(200);
    expect(session.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'cancelled' }));
    expect(session.in).toHaveBeenCalledWith('status', ['cancelling']);
  });
});

function prospectHangupClient({ sessionStatus = 'dialing', completeError = null, active = [] } = {}) {
  const call = thenable({ data: {
    id: 2, owner_user_id: 'user-1', pool_session_id: 'pool-1',
    telnyx_call_id: 'cc-2', status: 'ringing',
  }, error: null });
  const sessionLookup = thenable({ data: { winner_call_id: null, status: sessionStatus }, error: null });
  const activeLookup = thenable({ data: active, error: null });
  const sessionUpdate = thenable({ data: null, error: completeError });
  let callsUse = 0;
  let sessionsUse = 0;
  return {
    sessionUpdate,
    client: {
      from: vi.fn((table) => {
        if (table === 'dialer_pool_sessions') return [sessionLookup, sessionUpdate][sessionsUse++];
        return [call, activeLookup][callsUse++] ?? thenable();
      }),
    },
  };
}

describe('finalisations de session monotones', () => {
  it('un hangup agent tardif ne réécrit pas cancelled/failed en completed', async () => {
    const lookup = thenable({
      data: { owner_user_id: 'user-1', winner_call_id: 2 }, error: null,
    });
    const sessionUpdate = thenable();
    let sessionUse = 0;
    const client = {
      from: vi.fn((table) => (
        table === 'dialer_pool_sessions' ? [lookup, sessionUpdate][sessionUse++] : thenable()
      )),
    };
    const result = await processPoolWebhook({
      client, eventType: 'call.hangup',
      payload: { client_state: encodeState({ poolSessionId: 'pool-1', kind: 'agent' }) },
    });
    expect(result).toEqual({ status: 'processed', result: 'agent_ended' });
    expect(sessionUpdate.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' }));
    expect(sessionUpdate.in).toHaveBeenCalledWith('status', ['connecting', 'active']);
    expect(sessionUpdate.in).not.toHaveBeenCalledWith('status', expect.arrayContaining(['cancelled']));
    expect(sessionUpdate.in).not.toHaveBeenCalledWith('status', expect.arrayContaining(['failed']));
  });

  it('laisse le webhook retryable si la completion agent échoue en base', async () => {
    const lookup = thenable({
      data: { owner_user_id: 'user-1', winner_call_id: 2 }, error: null,
    });
    const sessionUpdate = thenable({ data: null, error: { message: 'db unavailable' } });
    let sessionUse = 0;
    const client = {
      from: vi.fn((table) => (
        table === 'dialer_pool_sessions' ? [lookup, sessionUpdate][sessionUse++] : thenable()
      )),
    };
    await expect(processPoolWebhook({
      client, eventType: 'call.hangup',
      payload: { client_state: encodeState({ poolSessionId: 'pool-1', kind: 'agent' }) },
    })).rejects.toThrow('agent session completion failed: db unavailable');
  });

  it('un hangup prospect ne termine pas completed une session déjà cancelled', async () => {
    const { client, sessionUpdate } = prospectHangupClient({ sessionStatus: 'cancelled' });
    const result = await processPoolWebhook({
      client, eventType: 'call.hangup',
      payload: {
        client_state: encodeState({ callRecordId: 2, poolSessionId: 'pool-1' }),
        hangup_cause: 'normal',
      },
    });
    expect(result.status).toBe('processed');
    expect(sessionUpdate.update).not.toHaveBeenCalled();
  });

  it('finalise cancelled seulement depuis cancelling, completed depuis dialing/connecting', async () => {
    const cancelling = prospectHangupClient({ sessionStatus: 'cancelling' });
    await processPoolWebhook({
      client: cancelling.client, eventType: 'call.hangup',
      payload: { client_state: encodeState({ callRecordId: 2, poolSessionId: 'pool-1' }) },
    });
    expect(cancelling.sessionUpdate.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'cancelled' }));
    expect(cancelling.sessionUpdate.in).toHaveBeenCalledWith('status', ['cancelling']);

    const connecting = prospectHangupClient({ sessionStatus: 'connecting' });
    await processPoolWebhook({
      client: connecting.client, eventType: 'call.hangup',
      payload: { client_state: encodeState({ callRecordId: 2, poolSessionId: 'pool-1' }) },
    });
    expect(connecting.sessionUpdate.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' }));
    expect(connecting.sessionUpdate.in).toHaveBeenCalledWith('status', ['dialing', 'connecting']);
  });

  it('laisse le webhook retryable si la completion sans winner échoue en base', async () => {
    const { client } = prospectHangupClient({
      sessionStatus: 'dialing', completeError: { message: 'db unavailable' },
    });
    await expect(processPoolWebhook({
      client, eventType: 'call.hangup',
      payload: { client_state: encodeState({ callRecordId: 2, poolSessionId: 'pool-1' }) },
    })).rejects.toThrow('pool completion failed: db unavailable');
  });

  it('un échec agent après annulation ne force pas failed hors des statuts live', async () => {
    const client = winnerClient({ agentUpdated: false });
    mocks.dialContact.mockResolvedValue({ call_control_id: 'cc-agent' });
    await expect(processPoolWebhook({
      client, eventType: 'call.machine.premium.detection.ended',
      payload: {
        client_state: encodeState({ callRecordId: 2, poolSessionId: 'pool-1' }),
        call_control_id: 'cc-winner', result: 'human',
      },
    })).rejects.toThrow('pool cancelled during agent persistence');
    expect(client.failUpdate.in).toHaveBeenCalledWith('status', ['dialing', 'connecting', 'active']);
  });

  it('laisse le webhook retryable si la persistance failed agent échoue en base', async () => {
    const client = winnerClient({
      agentUpdated: false, failUpdateError: { message: 'db unavailable' },
    });
    mocks.dialContact.mockResolvedValue({ call_control_id: 'cc-agent' });
    await expect(processPoolWebhook({
      client, eventType: 'call.machine.premium.detection.ended',
      payload: {
        client_state: encodeState({ callRecordId: 2, poolSessionId: 'pool-1' }),
        call_control_id: 'cc-winner', result: 'human',
      },
    })).rejects.toThrow('agent failure persistence failed: db unavailable');
  });

  it('laisse le webhook retryable si le claim winner échoue en base', async () => {
    const call = thenable({ data: {
      id: 2, owner_user_id: 'user-1', pool_session_id: 'pool-1',
      telnyx_call_id: 'cc-winner', status: 'answered',
    }, error: null });
    const amd = thenable();
    let callsUse = 0;
    const client = {
      rpc: vi.fn(async () => ({ data: null, error: { message: 'db unavailable' } })),
      from: vi.fn(() => [call, amd][callsUse++]),
    };
    await expect(processPoolWebhook({
      client, eventType: 'call.machine.premium.detection.ended',
      payload: {
        client_state: encodeState({ callRecordId: 2, poolSessionId: 'pool-1' }),
        call_control_id: 'cc-winner', result: 'human',
      },
    })).rejects.toThrow('winner claim failed: db unavailable');
  });

  it('délègue call.answered à la RPC et propage une erreur DB', async () => {
    const call = thenable({ data: {
      id: 2, owner_user_id: 'user-1', pool_session_id: 'pool-1',
      telnyx_call_id: 'cc', status: 'ended',
    }, error: null });
    const client = {
      rpc: vi.fn(async () => ({ data: null, error: { message: 'db unavailable' } })),
      from: vi.fn(() => call),
    };
    await expect(processPoolWebhook({
      client, eventType: 'call.answered',
      payload: { client_state: encodeState({ callRecordId: 2, poolSessionId: 'pool-1' }) },
    })).rejects.toThrow('call answered persistence failed: db unavailable');
    expect(client.rpc).toHaveBeenCalledWith(
      'dialer_mark_call_answered',
      expect.objectContaining({ p_call_id: 2, p_owner_user_id: 'user-1' }),
    );
    expect(call.update).not.toHaveBeenCalled();
  });
});

describe('migration 048 — correctifs locaux', () => {
  it('refuse d’élire une ligne ended/non éligible et ne rouvre pas un answered tardif', async () => {
    const sql = await readFile(
      new URL('../../supabase/migrations/048_dialer_cancellation_and_webhook_lease.sql', import.meta.url),
      'utf8',
    );
    const compact = sql.toLowerCase().replace(/\s+/g, ' ');
    expect(compact).toContain('and ended_at is null');
    expect(compact).toContain("and status in ('dialing', 'ringing', 'answered')");
    expect(compact).toContain("status = case when ended_at is null then 'answered' else status end");
    expect(compact).toContain("and status in ('reserved', 'released', 'expired')");
  });
});
