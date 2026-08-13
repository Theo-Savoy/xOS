import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchSpy = vi.fn();
vi.stubGlobal('fetch', fetchSpy);

const {
  dialContact,
  getTelephonyCredential,
  hangupCall,
} = await import('./telnyx.js');

describe('Telnyx Call Control transport — lot 11.8', () => {
  beforeEach(() => {
    fetchSpy.mockReset();
  });

  it('compose un leg prospect silencieux avec from explicite et AMD premium', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ data: {
      call_control_id: 'cc-1', call_leg_id: 'leg-1', call_session_id: 'sess-1',
    } }), { status: 200 }));

    await dialContact({
      apiKey: 'key', connectionId: 'connection', from: '+33100000000',
      to: '+33200000000', webhookUrl: 'https://example.test/webhook',
      clientState: { callRecordId: 42, poolSessionId: 'pool-1', slot: 0 },
      commandId: 'cmd-1', dryRun: false,
    });

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body).toMatchObject({
      from: '+33100000000',
      to: '+33200000000',
      privacy: 'none',
      answering_machine_detection: 'premium',
      command_id: 'cmd-1',
    });
    expect(body.audio_url).toBeUndefined();
    expect(JSON.parse(Buffer.from(body.client_state, 'base64').toString('utf8'))).toEqual({
      callRecordId: 42, poolSessionId: 'pool-1', slot: 0,
    });
  });

  it('compose le poste agent lié au gagnant et sans AMD', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ data: {
      call_control_id: 'agent-cc', call_leg_id: 'agent-leg', call_session_id: 'sess-1',
    } }), { status: 200 }));

    await dialContact({
      apiKey: 'key', connectionId: 'connection', from: '+33100000000',
      to: 'sip:gencred123@sip.telnyx.com', webhookUrl: 'https://example.test/webhook',
      clientState: { poolSessionId: 'pool-1', kind: 'agent' },
      amd: null, linkTo: 'winner-cc', bridgeOnAnswer: true,
      preventDoubleBridge: true, commandId: 'agent-cmd', dryRun: false,
    });

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.answering_machine_detection).toBeUndefined();
    expect(body).toMatchObject({
      link_to: 'winner-cc', bridge_on_answer: true, prevent_double_bridge: true,
    });
  });

  it('récupère le sip_username de la telephony credential sans exposer le secret', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ data: {
      id: 'cred-1', sip_username: 'gencred123', sip_password: 'secret',
    } }), { status: 200 }));
    const result = await getTelephonyCredential({ apiKey: 'key', credentialId: 'cred-1' });
    expect(result).toEqual({ sipUsername: 'gencred123' });
  });

  it('raccroche avec un command_id idempotent', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ data: { result: 'ok' } }), { status: 200 }));
    await hangupCall({ apiKey: 'key', callControlId: 'cc-1', commandId: 'hangup-1' });
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body)).toEqual({
      cause: 'user_hangup', command_id: 'hangup-1',
    });
  });
});
