// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DialerView } from './DialerView';

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const configBody = {
  env: 'dev',
  is_dry_run: false,
  has_caller_id: true,
  has_webhook_public_key: false,
  flags: {
    enabled: true,
    dry_run: false,
    budget_session_cents: 300,
    budget_user_day_cents: 1000,
    budget_org_month_cents: 15000,
    rate_rps: 5,
    rate_burst: 20,
  },
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue(jsonResponse(200, configBody));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('DialerView', () => {
  it('charges and shows the dialer state from /api/dialer?resource=config', async () => {
    render(
      <DialerView
        token="tok"
        onBack={vi.fn()}
        defaultWebhookUrl="https://tunnel/api/dialer?resource=webhooks"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Dialer Telnyx')).toBeTruthy();
    });

    // L'état est affiché : env, dry-run, caller ID.
    expect(screen.getByText('dev')).toBeTruthy();
    expect(screen.getByText(/activé/)).toBeTruthy();
    expect(screen.getByText(/configuré/)).toBeTruthy();

    const configCall = fetchMock.mock.calls.find(
      (c) => c[0] === '/api/dialer?resource=config',
    );
    expect(configCall).toBeTruthy();
    const [, init] = configCall as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer tok',
    );
  });

  it('posts the dial payload when Appeler is clicked', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, configBody));
    const dialBody = { ok: true, dry_run: false, call_id: 'call-123' };
    fetchMock.mockResolvedValueOnce(jsonResponse(200, dialBody));

    render(
      <DialerView
        token="tok"
        onBack={vi.fn()}
        defaultWebhookUrl="https://tunnel/api/dialer?resource=webhooks"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Dialer Telnyx')).toBeTruthy();
    });

    const phone = screen.getByPlaceholderText('+33123456789');
    await userEvent.type(phone, '+33612345678');

    const conn = screen.getByPlaceholderText('1a2b3c4d-…');
    await userEvent.type(conn, 'app-123');

    const callBtn = screen.getByRole('button', { name: /Appeler/i });
    await act(async () => {
      await userEvent.click(callBtn);
    });

    await waitFor(() => {
      expect(screen.getByText(/call-123/)).toBeTruthy();
    });

    const dialCall = fetchMock.mock.calls.find(
      (c) => c[0] === '/api/dialer?resource=dial',
    );
    expect(dialCall).toBeTruthy();
    const [, init] = dialCall as [string, RequestInit];
    expect(init.method).toBe('POST');
    const sent = JSON.parse(String(init.body));
    expect(sent).toMatchObject({
      to: '+33612345678',
      connection_id: 'app-123',
      webhook_url: 'https://tunnel/api/dialer?resource=webhooks',
    });
  });

  it('shows a clear message when the dialer is disabled (503)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, configBody));
    fetchMock.mockResolvedValueOnce(
      jsonResponse(503, { error: 'dialer_disabled' }),
    );

    render(
      <DialerView
        token="tok"
        onBack={vi.fn()}
        defaultWebhookUrl="https://tunnel/api/dialer?resource=webhooks"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Dialer Telnyx')).toBeTruthy();
    });

    await userEvent.type(screen.getByPlaceholderText('+33123456789'), '+33123456789');
    await userEvent.type(screen.getByPlaceholderText('1a2b3c4d-…'), 'app-123');

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /Appeler/i }));
    });

    await waitFor(() => {
      expect(
        screen.getByText(/Dialer désactivé : flags\.dialer_enabled est false en base\./),
      ).toBeTruthy();
    });
  });

  it('requires a phone number before dialing', async () => {
    render(
      <DialerView
        token="tok"
        onBack={vi.fn()}
        defaultWebhookUrl="https://tunnel/api/dialer?resource=webhooks"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Dialer Telnyx')).toBeTruthy();
    });

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /Appeler/i }));
    });

    expect(screen.getByText(/Numéro requis/)).toBeTruthy();
    // Aucun appel dial envoyé.
    expect(
      fetchMock.mock.calls.some((c) => c[0] === '/api/dialer?resource=dial'),
    ).toBe(false);
  });
});
