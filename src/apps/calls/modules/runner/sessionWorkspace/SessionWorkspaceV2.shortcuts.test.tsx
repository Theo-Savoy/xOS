// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionContact, SessionDetail } from '../../../types';
import { Modal } from '../../../../../components/ui';
import { DialerProvider } from '../../dialer/DialerProvider';
import { SessionWorkspaceV2 } from './SessionWorkspaceV2';
import type { SessionWorkspaceProps } from './types';

const { mockUseSessionPowerPool } = vi.hoisted(() => ({
  mockUseSessionPowerPool: vi.fn(),
}));

vi.mock('./useSessionPowerPool', () => ({
  useSessionPowerPool: mockUseSessionPowerPool,
}));

const session: SessionDetail = {
  id: 42,
  name: 'Séance Raccourcis V2',
  status: 'active',
  created_at: '2026-07-10T10:00:00Z',
  rdv_goal: 4,
};

const contact: SessionContact = {
  id: 101,
  position: 0,
  sf_contact_id: 'sf-101',
  sf_account_id: 'acc-1',
  contact_name: 'Alice Martin',
  account_name: 'Tech Corp',
  phone: '+33612345678',
  email: 'alice@techcorp.com',
  title: 'Directrice Technique',
  linkedin_url: null,
  status: 'pending',
  outcome: null,
  comments: null,
  sf_task_id: null,
  sf_event_id: null,
  called_at: null,
  claim_active: false,
  claimed_at: null,
  claimed_by: null,
};

function makePowerPool(state: 'off' | 'conversation' = 'off') {
  return {
    isPowerActive: state === 'conversation',
    togglePower: vi.fn(),
    powerViewModel: {
      state,
      primaryCta: {
        id: 'call-sequential',
        label: 'Appeler',
        variant: 'primary',
        location: 'header',
      },
      isPowerActive: state === 'conversation',
      isSettingsLocked: state === 'conversation',
      isCallBarHidden: state === 'conversation',
      canRelaunch: false,
      canHangupAll: false,
      canRetryHangup: false,
      isQueueCollapsed: state === 'conversation',
    },
    projectedQueue: {
      queue: [],
      contactIds: [],
      byPhone: new Map(),
      readyCount: 0,
      unreachableCount: 0,
      totalEligiblePendingCount: 0,
      duplicateCount: 0,
    },
    parallelism: 3,
    setParallelism: vi.fn(),
    callerNumber: '',
    setCallerNumber: vi.fn(),
    callerNumbers: [],
    quota: {
      used: 0,
      limit: null,
      remaining: null,
      blocked: false,
      constrained: false,
    },
    lines: [],
    byPhone: new Map(),
    error: null,
    agentConnected: false,
    launching: false,
    hasAttempted: false,
    onLaunch: vi.fn(),
    onHangupAll: vi.fn(),
    onSkip: vi.fn(),
    onRetryHangup: vi.fn(),
    notifyLogged: vi.fn(),
    requestExit: vi.fn(),
  };
}

function makeProps(
  overrides: Partial<SessionWorkspaceProps> = {},
): SessionWorkspaceProps {
  return {
    session,
    contacts: [contact],
    hubSessions: [],
    currentContact: contact,
    focusedContactId: contact.id,
    variant: 'session',
    loading: false,
    error: null,
    awaitingEvent: null,
    contactContext: null,
    contextContactId: null,
    onBack: vi.fn(),
    onFocusContact: vi.fn(),
    onLogAndNext: vi.fn(),
    onLogRdvAndNext: vi.fn(),
    onLogMany: vi.fn(),
    onLogEvent: vi.fn(),
    onDeferContacts: vi.fn(),
    onRemoveContacts: vi.fn(),
    onUpdateRecall: vi.fn(),
    runnerVersion: 'v2',
    ...overrides,
  };
}

function renderWorkspace(
  overrides: Partial<SessionWorkspaceProps> = {},
  withModal = false,
) {
  const props = makeProps(overrides);
  render(
    <DialerProvider token="mock-token" dryRun>
      <SessionWorkspaceV2 {...props} />
      {withModal && (
        <Modal
          open
          title="Modal bloquante"
          onClose={vi.fn()}
        >
          Contenu modal
        </Modal>
      )}
    </DialerProvider>,
  );
  return props;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseSessionPowerPool.mockImplementation(() => makePowerPool());
});

afterEach(cleanup);

describe('SessionWorkspaceV2 — L5C raccourcis V2', () => {
  it('ouvre la file avec L, la fiche avec F, choisit 1–5 et consigne avec ⌘↵', () => {
    const props = renderWorkspace();

    fireEvent.keyDown(document, { key: 'l', code: 'KeyL' });
    expect(screen.getByRole('dialog', { name: /file étendue/i })).toBeTruthy();

    fireEvent.click(
      screen.getByRole('button', { name: /fermer la file étendue/i }),
    );
    fireEvent.keyDown(document, { key: 'f', code: 'KeyF' });
    expect(props.onFocusContact).toHaveBeenCalledWith(contact.id);

    const resultLabels = [
      'Appel non décroché',
      'Message répondeur',
      'Appel décroché',
      'Appel argumenté',
      'RDV planifié',
    ];
    resultLabels.forEach((label, index) => {
      const digit = String(index + 1);
      fireEvent.keyDown(document, { key: digit, code: `Digit${digit}` });
      expect(
        screen.getByRole('button', { name: label }).getAttribute('aria-pressed'),
      ).toBe('true');
    });

    // Le raccourci 5 ouvre l'EventPanel ; revenir à un résultat simple permet
    // de vérifier le submit ⌘↵ sur le chemin ACW standard.
    fireEvent.keyDown(document, { key: '2', code: 'Digit2' });

    fireEvent.keyDown(document, {
      key: 'Enter',
      code: 'Enter',
      metaKey: true,
    });
    expect(props.onLogAndNext).toHaveBeenCalledWith(
      contact.id,
      expect.objectContaining({ resultat: 'Message répondeur' }),
    );
  });

  it('désactive les raccourcis dans les champs, EventPanel, modales et la surface bulk', () => {
    const props = renderWorkspace();
    const comments = screen.getByRole('textbox', { name: 'Commentaires' });

    fireEvent.keyDown(comments, { key: '2', code: 'Digit2' });
    fireEvent.keyDown(comments, {
      key: 'Enter',
      code: 'Enter',
      metaKey: true,
    });
    expect(
      screen
        .getByRole('button', { name: 'Message répondeur' })
        .getAttribute('aria-pressed'),
    ).toBe('false');
    expect(props.onLogAndNext).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole('button', { name: 'RDV planifié' }),
    );
    const eventPanelHeading = screen.getByRole('heading', {
      name: /rdv planifié — alice martin/i,
    });
    fireEvent.keyDown(eventPanelHeading, { key: '2', code: 'Digit2' });
    fireEvent.keyDown(eventPanelHeading, {
      key: 'Enter',
      code: 'Enter',
      metaKey: true,
    });
    expect(props.onLogAndNext).not.toHaveBeenCalled();

    fireEvent.keyDown(document, { key: 'l', code: 'KeyL' });
    expect(screen.getByRole('dialog', { name: /file étendue/i })).toBeTruthy();
    fireEvent.keyDown(document, { key: '2', code: 'Digit2' });
    expect(
      screen
        .getByRole('button', { name: 'Message répondeur' })
        .getAttribute('aria-pressed'),
    ).toBe('false');

    cleanup();
    const modalProps = renderWorkspace({}, true);
    fireEvent.keyDown(document, { key: '2', code: 'Digit2' });
    expect(
      screen
        .getByRole('button', { name: 'Message répondeur' })
        .getAttribute('aria-pressed'),
    ).toBe('false');
    expect(modalProps.onLogAndNext).not.toHaveBeenCalled();
  });

  it('désactive tous les raccourcis pendant une conversation Power, dont L', () => {
    mockUseSessionPowerPool.mockImplementation(() =>
      makePowerPool('conversation'),
    );
    const props = renderWorkspace();

    fireEvent.keyDown(document, { key: 'l', code: 'KeyL' });
    fireEvent.keyDown(document, { key: 'f', code: 'KeyF' });
    fireEvent.keyDown(document, { key: '2', code: 'Digit2' });
    fireEvent.keyDown(document, {
      key: 'Enter',
      code: 'Enter',
      metaKey: true,
    });

    expect(screen.queryByRole('dialog', { name: /file étendue/i })).toBeNull();
    expect(props.onFocusContact).not.toHaveBeenCalled();
    expect(props.onLogAndNext).not.toHaveBeenCalled();
  });

  it('n’installe aucun listener clavier global quand active=false', () => {
    const addEventListener = vi.spyOn(document, 'addEventListener');
    renderWorkspace({ active: false });

    expect(
      addEventListener.mock.calls.filter(([type]) => type === 'keydown'),
    ).toHaveLength(0);
    fireEvent.keyDown(document, { key: 'l', code: 'KeyL' });
    expect(screen.queryByRole('dialog', { name: /file étendue/i })).toBeNull();
    addEventListener.mockRestore();
  });

  it('n’installe qu’un listener clavier V2 quand la surface est active', () => {
    const addEventListener = vi.spyOn(document, 'addEventListener');

    try {
      renderWorkspace();
      expect(
        addEventListener.mock.calls.filter(([type]) => type === 'keydown'),
      ).toHaveLength(1);
    } finally {
      addEventListener.mockRestore();
    }
  });
});
