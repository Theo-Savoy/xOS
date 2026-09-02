// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Button } from '../../components/ui';
import { DialerTools } from './DialerTools';

const { mockFetchDialerConfig } = vi.hoisted(() => ({ mockFetchDialerConfig: vi.fn() }));
vi.mock('../calls/modules/dialer/dialerApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../calls/modules/dialer/dialerApi')>()),
  fetchDialerConfig: mockFetchDialerConfig,
}));
// Les deux vues sont testées chez elles ; ici on vérifie le gating et le
// retour, pas leur contenu (elles ouvriraient un socket WebRTC).
vi.mock('../calls/modules/dialer/DialerProvider', () => ({
  DialerProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useDialer: () => ({ phase: 'idle', isActive: false }),
}));
vi.mock('../calls/modules/dialer/DialerView', () => ({
  DialerView: ({ onBack }: { onBack: () => void }) => (
    <Button onClick={onBack}>fermer dialer</Button>
  ),
}));
vi.mock('../calls/modules/dialer/PowerDialerView', () => ({
  PowerDialerView: ({ onBack }: { onBack: () => void }) => (
    <Button onClick={onBack}>fermer power</Button>
  ),
}));

function config(over: Partial<Record<string, unknown>> = {}) {
  return {
    env: 'production', is_dry_run: false, has_caller_id: true,
    has_connection_id: true, has_webhook_public_key: true, caller_numbers: [],
    entitlement: { enabled: true, dry_run: false, calls_day_limit: 50, calls_today: 0 },
    flags: {
      enabled: true, dry_run: false, budget_session_cents: 300,
      budget_user_day_cents: 1000, budget_org_month_cents: 15000,
      rate_rps: 5, rate_burst: 20,
    },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchDialerConfig.mockResolvedValue(config());
});
afterEach(cleanup);

describe('DialerTools (Coulisses)', () => {
  it('ouvre puis referme chaque banc d’essai', async () => {
    render(<DialerTools token="tok" />);
    const dialer = await screen.findByRole('button', { name: 'Dialer' });
    await waitFor(() => expect(dialer.hasAttribute('disabled')).toBe(false));

    fireEvent.click(dialer);
    fireEvent.click(screen.getByRole('button', { name: 'fermer dialer' }));

    fireEvent.click(screen.getByRole('button', { name: 'Power dialer' }));
    fireEvent.click(screen.getByRole('button', { name: 'fermer power' }));
    expect(screen.getByRole('button', { name: 'Dialer' })).toBeTruthy();
  });

  it('annonce un compte non entitlementé au lieu de proposer les outils', async () => {
    mockFetchDialerConfig.mockResolvedValue(
      config({ entitlement: { enabled: false, dry_run: true, calls_day_limit: 50, calls_today: 0 } }),
    );
    render(<DialerTools token="tok" />);
    expect(await screen.findByText(/Dialer non activé pour ce compte/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Dialer' })).toBeNull();
  });

  it('laisse le power dialer inaccessible sans connection ni webhook Telnyx', async () => {
    mockFetchDialerConfig.mockResolvedValue(config({ has_webhook_public_key: false }));
    render(<DialerTools token="tok" />);
    await waitFor(() => expect(
      screen.getByRole('button', { name: 'Dialer' }).hasAttribute('disabled'),
    ).toBe(false));
    expect(
      screen.getByRole('button', { name: 'Power dialer' }).hasAttribute('disabled'),
    ).toBe(true);
  });
});
