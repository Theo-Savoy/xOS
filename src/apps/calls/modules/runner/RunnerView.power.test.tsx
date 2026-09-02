// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RunnerView } from './RunnerView';
import type { SessionContact, SessionDetail } from '../../types';

vi.mock('../dialer/DialerProvider', () => ({
  useDialer: () => ({
    phase: 'idle', error: null, durationSec: 0, destination: '', callStats: null,
    startCall: vi.fn().mockResolvedValue(true), hangup: vi.fn(), isActive: false,
  }),
}));
// L'encart réel monte le pool (WebRTC + réseau) : ici on ne teste que sa
// présence et le passage de la séance.
vi.mock('./PowerStrip', () => ({
  PowerStrip: ({ sessionId }: { sessionId: number }) => (
    <div data-testid="power-strip">séance {sessionId}</div>
  ),
}));

const session: SessionDetail = {
  id: 12, name: 'Séance test', status: 'active', created_at: '2026-07-10T10:00:00Z',
};

const bob = {
  id: 2, position: 1, sf_contact_id: '003000000000002', sf_account_id: null,
  contact_name: 'Bob Durand', account_name: 'Acme', phone: '+33102030405',
  email: null, title: null, linkedin_url: null, status: 'pending', outcome: null,
  comments: null, sf_task_id: null, sf_event_id: null, called_at: null,
} as SessionContact;

const baseProps = {
  session, hubSessions: [] as [], loading: false, error: null as string | null,
  contactContext: null, contextContactId: null, awaitingEvent: null,
  contacts: [bob], currentContact: bob,
  onBack: vi.fn(), onFocusContact: vi.fn(), onLogAndNext: vi.fn(),
  onLogRdvAndNext: vi.fn(), onLogEvent: vi.fn(), onDeferContacts: vi.fn(),
  onRemoveContacts: vi.fn(), onUpdateRecall: vi.fn(), onLogMany: vi.fn(),
};

beforeEach(() => {
  window.localStorage?.setItem('xos-combo-demo-seen', '1');
  window.localStorage?.setItem('xos-combo-sounds', '0');
});
afterEach(cleanup);

const powerButton = () => screen.queryByRole('button', { name: 'Power' });

describe('RunnerView — encart power', () => {
  it('n’expose pas le power sans droit dialer', () => {
    render(<RunnerView {...baseProps} token="tok" canPowerDialer={false} />);
    expect(powerButton()).toBeNull();
    expect(screen.queryByTestId('power-strip')).toBeNull();
  });

  it('monte l’encart sur la séance courante après bascule explicite', () => {
    render(<RunnerView {...baseProps} token="tok" canPowerDialer />);
    expect(screen.queryByTestId('power-strip')).toBeNull();

    fireEvent.click(powerButton()!);
    expect(screen.getByTestId('power-strip').textContent).toBe('séance 12');

    fireEvent.click(powerButton()!);
    expect(screen.queryByTestId('power-strip')).toBeNull();
  });

  it('n’expose pas le power dans la file de rappels (séances mélangées)', () => {
    render(<RunnerView {...baseProps} token="tok" canPowerDialer variant="recalls" />);
    expect(powerButton()).toBeNull();
  });
});
