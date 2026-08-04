// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DialerView } from './DialerView';
import { DialerProvider } from './DialerProvider';

/** DialerView consomme useDialer (provider global) — on enveloppe le render. */
function renderDialer() {
  return render(
    <DialerProvider token="tok" dryRun={true}>
      <DialerView token="tok" onBack={vi.fn()} />
    </DialerProvider>,
  );
}

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
  caller_numbers: [
    { e164: '+336****8001', label: 'Mobile vérifié (Théo)', status: 'active', priority: 1 },
    { e164: '+334****1891', label: 'Numéro FR dev', status: 'active', priority: 2 },
  ],
  entitlement: { enabled: true, dry_run: true },
  flags: {
    enabled: true,
    dry_run: true,
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
  // Permission micro accordée par défaut (le hook demande getUserMedia).
  // On ne remplace QUE mediaDevices — jamais navigator entier (casserait jsdom).
  const origNavigator = window.navigator;
  Object.defineProperty(origNavigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [] }) },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('DialerView', () => {
  it('charges and shows the dialer state from /api/dialer?resource=config', async () => {
    renderDialer();

    await waitFor(() => {
      expect(screen.getByText('Dialer Telnyx')).toBeTruthy();
    });

    // L'état est affiché : env, dry-run (simulation), caller ID.
    expect(screen.getByText('dev')).toBeTruthy();
    expect(screen.getByText(/oui \(aucun appel réel\)/)).toBeTruthy();
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

  it('dry-run : Appeler demande le micro et passe en simulation (aucun réseau)', async () => {
    renderDialer();

    await waitFor(() => {
      expect(screen.getByText('Dialer Telnyx')).toBeTruthy();
    });

    const phone = screen.getByPlaceholderText('+331****6789');
    await userEvent.type(phone, '+336****5678');

    const callBtn = screen.getByRole('button', { name: /Dial dry-run/i });
    await act(async () => {
      await userEvent.click(callBtn);
    });

    // La vue passe en simulation (dry-run) : pas d'appel dial, pas de token.
    await waitFor(() => {
      expect(screen.getByText(/Sonnerie…|En communication/)).toBeTruthy();
    });

    // Aucun appel réseau vers resource=dial ni vers Telnyx. En dry-run le hook
    // appelle webrtc_token (le serveur répond { token: null } — G2) : c'est
    // voulu. L'important : PAS de resource=dial, et aucun fetch externe.
    const networkCalls = fetchMock.mock.calls.filter(
      (c) => String(c[0]).includes('/api/dialer'),
    );
    expect(
      networkCalls.every((c) =>
        String(c[0]).includes('resource=config') ||
        String(c[0]).includes('resource=webrtc_token'),
      ),
    ).toBe(true);
  });

  it('shows the Raccrocher button during an active call and hangs up', async () => {
    renderDialer();

    await waitFor(() => {
      expect(screen.getByText('Dialer Telnyx')).toBeTruthy();
    });

    await userEvent.type(
      screen.getByPlaceholderText('+331****6789'),
      '+336****5678',
    );

    // Simulation : le hook passe à connected via setTimeout(1500) réel.
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /Dial dry-run/i }));
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Raccrocher/i })).toBeTruthy();
    });

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /Raccrocher/i }));
    });

    // Raccrochage → wrapping puis idle. Le bouton Raccrocher disparaît.
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Raccrocher/i })).toBeNull();
    });
  });

  it('requires a phone number before dialing', async () => {
    renderDialer();

    await waitFor(() => {
      expect(screen.getByText('Dialer Telnyx')).toBeTruthy();
    });

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /Dial dry-run/i }));
    });

    expect(screen.getByText(/Numéro requis/)).toBeTruthy();
    // Aucun appel dial envoyé.
    expect(
      fetchMock.mock.calls.some((c) => c[0] === '/api/dialer?resource=dial'),
    ).toBe(false);
  });
});
