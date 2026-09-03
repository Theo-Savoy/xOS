// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RunnerView } from './RunnerView';
import type { SessionContact, SessionDetail } from '../../types';

vi.mock('../dialer/DialerProvider', () => ({
  useDialer: () => ({
    phase: 'idle', error: null, durationSec: 0, destination: '', callStats: null,
    startCall: vi.fn().mockResolvedValue(true), hangup: vi.fn(), isActive: false,
  }),
}));
// L'encart réel monte le pool (WebRTC + réseau) : ici on teste sa présence
// et les signaux immersifs remontés à RunnerView.
let mockStripProps: {
  onConversationChange?: (inConversation: boolean) => void;
  onRunningChange?: (running: boolean) => void;
  onRegisterHangup?: (hangup: (() => void) | null) => void;
} = {};

vi.mock('./PowerStrip', () => ({
  PowerStrip: (props: {
    sessionId: number;
    onConversationChange?: (inConversation: boolean) => void;
    onRunningChange?: (running: boolean) => void;
    onRegisterHangup?: (hangup: (() => void) | null) => void;
  }) => {
    mockStripProps = props;
    return <div data-testid="power-strip">séance {props.sessionId}</div>;
  },
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
  mockStripProps = {};
  window.localStorage?.setItem('xos-combo-demo-seen', '1');
  window.localStorage?.setItem('xos-combo-sounds', '0');
});
afterEach(cleanup);

const powerSwitch = () => screen.queryByRole('switch', { name: 'Power' });

describe('RunnerView — encart power', () => {
  it('n’expose pas le power sans droit dialer', () => {
    render(<RunnerView {...baseProps} token="tok" canPowerDialer={false} />);
    expect(powerSwitch()).toBeNull();
    expect(screen.queryByTestId('power-strip')).toBeNull();
  });

  it('monte l’encart sur la séance courante après bascule explicite', () => {
    render(<RunnerView {...baseProps} token="tok" canPowerDialer />);
    expect(screen.queryByTestId('power-strip')).toBeNull();

    fireEvent.click(powerSwitch()!);
    expect(screen.getByTestId('power-strip').textContent).toBe('séance 12');

    fireEvent.click(powerSwitch()!);
    expect(screen.queryByTestId('power-strip')).toBeNull();
  });

  it('signale visuellement le mode actif sur le toggle Power', () => {
    render(<RunnerView {...baseProps} token="tok" canPowerDialer />);
    expect(powerSwitch()!.getAttribute('aria-checked')).toBe('false');
    expect(powerSwitch()!.className).not.toContain('calls-power-toggle--on');

    fireEvent.click(powerSwitch()!);
    expect(powerSwitch()!.getAttribute('aria-checked')).toBe('true');
    expect(powerSwitch()!.className).toContain('calls-power-toggle--on');
  });

  it('n’expose pas le power dans la file de rappels (séances mélangées)', () => {
    render(<RunnerView {...baseProps} token="tok" canPowerDialer variant="recalls" />);
    expect(powerSwitch()).toBeNull();
  });

  it('applique la classe racine calls-view--power et le badge Power actif à l’activation', () => {
    const { container } = render(<RunnerView {...baseProps} token="tok" canPowerDialer />);
    const root = container.querySelector('.calls-view--runner')!;
    expect(root.className).not.toContain('calls-view--power');
    expect(screen.queryByText('Power actif')).toBeNull();

    fireEvent.click(powerSwitch()!);
    expect(root.className).toContain('calls-view--power');
    expect(screen.getByText('Power actif')).toBeTruthy();
  });

  it('applique la classe racine calls-view--power-conversation et met à jour le badge quand la conversation est active', () => {
    const { container } = render(<RunnerView {...baseProps} token="tok" canPowerDialer />);
    const root = container.querySelector('.calls-view--runner')!;

    fireEvent.click(powerSwitch()!);
    expect(root.className).toContain('calls-view--power');
    expect(root.className).not.toContain('calls-view--power-conversation');

    act(() => {
      mockStripProps.onConversationChange?.(true);
    });
    expect(root.className).toContain('calls-view--power-conversation');
    expect(screen.getByText('Power · En ligne')).toBeTruthy();

    act(() => {
      mockStripProps.onConversationChange?.(false);
    });
  });

  it('remplace le switch par l’action « Raccrocher et quitter » pendant une vague active', () => {
    render(<RunnerView {...baseProps} token="tok" canPowerDialer />);
    fireEvent.click(powerSwitch()!);

    expect(screen.queryByRole('button', { name: 'Raccrocher et quitter' })).toBeNull();
    expect(powerSwitch()).toBeTruthy();

    act(() => {
      mockStripProps.onRunningChange?.(true);
    });
    expect(screen.queryByRole('switch', { name: 'Power' })).toBeNull();
    const exitBtn = screen.getByRole('button', { name: 'Raccrocher et quitter' });
    expect(exitBtn).toBeTruthy();
    expect(exitBtn.className).toContain('xos-btn--danger');
  });

  it('interrompt la session via « Raccrocher et quitter » et désactive le mode Power', () => {
    const { container } = render(<RunnerView {...baseProps} token="tok" canPowerDialer />);
    const root = container.querySelector('.calls-view--runner')!;
    fireEvent.click(powerSwitch()!);

    const mockHangup = vi.fn();
    act(() => {
      mockStripProps.onRegisterHangup?.(mockHangup);
      mockStripProps.onRunningChange?.(true);
    });
    const exitBtn = screen.getByRole('button', { name: 'Raccrocher et quitter' });
    fireEvent.click(exitBtn);
    expect(mockHangup).toHaveBeenCalled();
    expect(root.className).not.toContain('calls-view--power');
    expect(screen.queryByTestId('power-strip')).toBeNull();
    expect(powerSwitch()).toBeTruthy();
    expect(powerSwitch()!.getAttribute('aria-checked')).toBe('false');
  });
});
