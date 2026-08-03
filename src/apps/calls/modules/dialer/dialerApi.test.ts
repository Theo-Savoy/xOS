import { describe, expect, it, vi } from 'vitest';
import { DialerApiError, dialCall, fetchDialerConfig } from './dialerApi';

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
      to: '+33123456789',
      connectionId: 'app-123',
      webhookUrl: 'https://x/api/dialer?resource=webhooks',
      sessionId: 7,
    });
    expect(res.ok).toBe(true);
    expect(res.call_control_id).toBe('call-ctrl-123');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/dialer?resource=dial');
    expect(init.method).toBe('POST');
    const sent = JSON.parse(String(init.body));
    expect(sent).toMatchObject({
      to: '+33123456789',
      connection_id: 'app-123',
      webhook_url: 'https://x/api/dialer?resource=webhooks',
      session_id: 7,
    });
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
        connectionId: 'app',
        webhookUrl: 'https://x',
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
        connectionId: 'app',
        webhookUrl: 'https://x',
      }),
    ).rejects.toBeInstanceOf(DialerApiError);
    vi.unstubAllGlobals();
  });
});
