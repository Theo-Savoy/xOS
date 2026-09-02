// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionContact } from '../../types';
import { PowerStrip } from './PowerStrip';

const { mockUseDialerPool } = vi.hoisted(() => ({ mockUseDialerPool: vi.fn() }));
vi.mock('../dialer/application/useDialerPool', () => ({ useDialerPool: mockUseDialerPool }));

const setQueue = vi.fn();
let winnerContactId: number | null = null;

function poolStub() {
  return {
    state: {
      size: 3, running: false, error: null, queue: ['+33100000001'],
      lines: [{ slot: 0, phase: 'idle' as const, destination: '', error: null }],
    },
    setQueue, play: vi.fn(), skip: vi.fn(), hangupAll: vi.fn(), redial: vi.fn(),
    isRunning: false, agentConnected: false, hangupRetryable: false, winnerContactId,
  };
}

function contact(over: Partial<SessionContact> & { id: number }): SessionContact {
  return {
    position: 0, sf_contact_id: null, sf_account_id: null, contact_name: 'X',
    account_name: null, phone: null, title: null, linkedin_url: null,
    status: 'pending', outcome: null, comments: null, sf_task_id: null,
    sf_event_id: null, called_at: null, ...over,
  } as SessionContact;
}

beforeEach(() => {
  vi.clearAllMocks();
  winnerContactId = null;
  mockUseDialerPool.mockImplementation(() => poolStub());
});
afterEach(cleanup);

function renderStrip(contacts: SessionContact[], onFocusContact = vi.fn()) {
  render(
    <PowerStrip
      token="tok"
      sessionId={7}
      contacts={contacts}
      currentUserId="me"
      onFocusContact={onFocusContact}
    />,
  );
  return onFocusContact;
}

describe('PowerStrip — file de séance', () => {
  it('ne garde que les pending joignables, dédupliqués par numéro', () => {
    renderStrip([
      contact({ id: 1, phone: '+33100000001' }),
      contact({ id: 2, phone: '+33100000002', status: 'called' }),
      contact({ id: 3, phone: '+33100000001' }), // même standard que le 1
      contact({ id: 4, phone: '01 00 00 00 04' }), // pas E.164 → le pool refuserait tout le lot
      contact({ id: 5, phone: null }),
      contact({ id: 6, phone: '+33100000006', claim_active: true, claimed_by: 'someone-else' }),
      contact({ id: 7, phone: '+33100000007' }),
    ]);
    expect(setQueue).toHaveBeenLastCalledWith(
      ['+33100000001', '+33100000007'],
      [1, 7],
    );
  });

  it('compte les contacts sans numéro composable', () => {
    renderStrip([
      contact({ id: 1, phone: '+33100000001' }),
      contact({ id: 2, phone: '01 00 00 00 02' }),
      contact({ id: 3, phone: null }),
    ]);
    const counter = screen.getByText('sans numéro').previousSibling;
    expect(counter?.textContent).toBe('2');
  });

  it('focalise la fiche du contact décroché', () => {
    winnerContactId = 42;
    const onFocusContact = renderStrip([contact({ id: 42, phone: '+33100000042' })]);
    expect(onFocusContact).toHaveBeenCalledWith(42);
  });

  it('ne focalise rien tant qu’aucune ligne n’a décroché', () => {
    const onFocusContact = renderStrip([contact({ id: 1, phone: '+33100000001' })]);
    expect(onFocusContact).not.toHaveBeenCalled();
  });
});
