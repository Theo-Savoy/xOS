import { describe, expect, it, vi } from 'vitest';
import { DialerApiError, dialCall, fetchDialerConfig, startPowerPool } from './dialerApi';

// Mock global fetch — apiFetch uses fetch under the hood.
function mockFetchOnce(status: number, body: unknown) {
  return vi.fn().mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

describe('fetchDialerConfig', () => {
  it('returns config on 200', async () => {
    const fetchMock = mockFetchOnce(200, {
      env: 'dryrun',
      is_dry_run: true,
      has_caller_id: true,
      has_webhook_public_key: false,
      flags: { enabled: false, dry_run: true },
    });
    vi.stubGlobal('fetch', fetchMock);

    const cfg = await fetchDialerConfig('token');
    expect(cfg.env).toBe('dryrun');
    expect(cfg.is_dry_run).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/dialer?resource=config',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer token',
        }),
      }),
    );
    vi.unstubAllGlobals();
  });

  it('maps 503 to DialerApiError', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchOnce(503, { error: 'dialer_disabled' }),
    );
    await expect(fetchDialerConfig('t')).rejects.toMatchObject({
      status: 503,
      code: 'dialer_disabled',
    });
    vi.unstubAllGlobals();
  });
});

describe('dialCall', () => {
  it('POSTs the dial payload and returns the result', async () => {
    const fetchMock = mockFetchOnce(200, {
      ok: true,
      dry_run: true,
      call_control_id: 'call-ctrl-123',
      call_leg_id: 'call-leg-1',
      call_session_id: 'call-sess-1',
      command_id: 'xos-dial-abc',
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await dialCall('token', {
      to: '+331****6789',
      sessionId: 7,
    });
    expect(res.ok).toBe(true);
    expect(res.call_control_id).toBe('call-ctrl-123');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/dialer?resource=dial');
    expect(init.method).toBe('POST');
    const sent = JSON.parse(String(init.body));
    expect(sent).toMatchObject({
      to: '+331****6789',
      session_id: 7,
    });
    // S2 (audit 11.13) : connection_id / webhook_url ne sont PLUS envoyés —
    // le serveur les résout côté config.
    expect(sent.connection_id).toBeUndefined();
    expect(sent.webhook_url).toBeUndefined();
    vi.unstubAllGlobals();
  });

  it('maps a 429 budget error to DialerApiError', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchOnce(429, {
        error: 'budget_exceeded_org_month',
        reservation: { allowed: false, reason: 'budget_exceeded_org_month' },
      }),
    );
    await expect(
      dialCall('token', {
        to: '+33',
      }),
    ).rejects.toMatchObject({
      status: 429,
      code: 'budget_exceeded_org_month',
    });
    vi.unstubAllGlobals();
  });

  it('surfaces dial_failed message', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchOnce(502, {
        error: 'dial_failed',
        message: 'Telnyx returned 402: insufficient funds',
      }),
    );
    await expect(
      dialCall('token', {
        to: '+33',
      }),
    ).rejects.toBeInstanceOf(DialerApiError);
    vi.unstubAllGlobals();
  });
});

describe('startPowerPool', () => {
  const started = { dry_run: false, session_id: 'pool-1', calls: [] };

  it('transmet le numéro sortant et le rattachement de séance au serveur', async () => {
    const fetchMock = mockFetchOnce(200, started);
    vi.stubGlobal('fetch', fetchMock);

    await startPowerPool('token', {
      destinations: ['+33100000001', '+33100000002'],
      parallelism: 2,
      callerNumber: '+33184800001',
      sessionId: 7,
      contactIds: [42, 43],
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/dialer?resource=pool_start');
    expect(JSON.parse(init.body)).toEqual({
      destinations: ['+33100000001', '+33100000002'],
      parallelism: 2,
      caller_number: '+33184800001',
      session_id: 7,
      contact_ids: [42, 43],
    });
    vi.unstubAllGlobals();
  });

  it('n’envoie ni séance ni contacts hors runner, et laisse le caller par défaut', async () => {
    const fetchMock = mockFetchOnce(200, started);
    vi.stubGlobal('fetch', fetchMock);

    await startPowerPool('token', { destinations: ['+33100000001'], parallelism: 1 });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      destinations: ['+33100000001'],
      parallelism: 1,
      caller_number: null,
    });
    vi.unstubAllGlobals();
  });
});
