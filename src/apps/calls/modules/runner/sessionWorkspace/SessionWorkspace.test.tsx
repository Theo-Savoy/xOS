// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionContact, SessionDetail } from '../../../types';
import { DialerProvider } from '../../dialer/DialerProvider';
import {
  readRunnerV2Flag,
  RUNNER_V2_STORAGE_KEY,
  writeRunnerV2Flag,
} from './featureFlag';
import { SessionWorkspace } from './SessionWorkspace';
import type { SessionWorkspaceProps } from './types';

const localStorageStore: Record<string, string> = {};
Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => localStorageStore[key] ?? null,
    setItem: (key: string, value: string) => {
      localStorageStore[key] = String(value);
    },
    removeItem: (key: string) => {
      delete localStorageStore[key];
    },
    clear: () => {
      Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k]);
    },
  },
});

const mockSession: SessionDetail = {
  id: 42,
  name: 'Séance Test Facade',
  status: 'active',
  created_at: '2026-07-10T10:00:00Z',
  rdv_goal: 3,
};
const mockContact: SessionContact = {
  id: 101,
  position: 0,
  sf_contact_id: null,
  sf_account_id: null,
  contact_name: 'Jean Dupont',
  account_name: 'Entreprise A',
  phone: '06 12 34 56 78',
  email: null,
  title: 'Directeur',
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

const baseProps: SessionWorkspaceProps = {
  session: mockSession,
  contacts: [mockContact],
  hubSessions: [],
  currentContact: mockContact,
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
};

function renderWithDialer(ui: React.ReactElement) {
  return render(<DialerProvider token="mock-token" dryRun>{ui}</DialerProvider>);
}

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState({}, '', '/');
});

afterEach(cleanup);

describe('SessionWorkspace - Feature flag et gel de version', () => {
  it('sélectionne legacy par défaut en l’absence de flag', () => {
    expect(readRunnerV2Flag()).toBe(false);
  });

  it('lit le flag activé depuis localStorage', () => {
    window.localStorage.setItem(RUNNER_V2_STORAGE_KEY, '1');
    expect(readRunnerV2Flag()).toBe(true);

    writeRunnerV2Flag(false);
    expect(readRunnerV2Flag()).toBe(false);
  });

  it('donne priorité au paramètre URL ?runner=v2 ou ?runner=legacy', () => {
    window.history.replaceState({}, '', '/?runner=v2');
    expect(readRunnerV2Flag()).toBe(true);

    window.history.replaceState({}, '', '/?runner=legacy');
    expect(readRunnerV2Flag()).toBe(false);
  });
});

describe('SessionWorkspace - Façade de migration (Plan §5)', () => {
  it('monte uniquement la vue legacy RunnerView quand le flag est inactif', () => {
    const { container } = renderWithDialer(<SessionWorkspace {...baseProps} />);

    // RunnerView historique monté
    expect(container.querySelector('.calls-view--runner')).toBeTruthy();
    expect(screen.queryByTestId('session-workspace-v2')).toBeNull();
  });

  it('monte uniquement la surface SessionWorkspaceV2 quand runnerVersion="v2" est demandé', () => {
    renderWithDialer(<SessionWorkspace {...baseProps} runnerVersion="v2" />);

    // Surface V2 montée
    expect(screen.getByTestId('session-workspace-v2')).toBeTruthy();
    // Le header legacy avec ses sous-composants n'est pas monté
    expect(screen.queryByRole('group', { name: "Mode d'affichage" })).toBeNull();
  });
  it('force la vue legacy quand variant="recalls" même avec runnerVersion="v2" (Grok note a)', () => {
    const { container } = renderWithDialer(
      <SessionWorkspace
        {...baseProps}
        variant="recalls"
        runnerVersion="v2"
      />,
    );

    // RunnerView historique monté (la file de rappels n'est pas paritaire en V2)
    expect(container.querySelector('.calls-view--runner')).toBeTruthy();
    expect(screen.queryByTestId('session-workspace-v2')).toBeNull();
  });


  it('garantit qu’une seule surface est montée à la fois (pas de double listeners/effets)', () => {
    // 1. Rendu legacy
    const { unmount } = renderWithDialer(
      <SessionWorkspace {...baseProps} runnerVersion="legacy" />,
    );
    expect(screen.queryByTestId('session-workspace-v2')).toBeNull();
    unmount();

    // 2. Rendu V2
    renderWithDialer(<SessionWorkspace {...baseProps} runnerVersion="v2" />);
    expect(screen.getByTestId('session-workspace-v2')).toBeTruthy();
    expect(screen.queryByRole('group', { name: "Mode d'affichage" })).toBeNull();
  });

  it('fige le choix de version pour toute la durée de la séance active (aucun basculement dynamique)', () => {
    // On démarre avec le flag inactif
    window.localStorage.setItem(RUNNER_V2_STORAGE_KEY, '0');
    const { rerender } = renderWithDialer(<SessionWorkspace {...baseProps} />);

    expect(screen.queryByTestId('session-workspace-v2')).toBeNull();

    // En cours de séance, le stockage local bascule sur '1' (par exemple via un autre onglet ou script)
    window.localStorage.setItem(RUNNER_V2_STORAGE_KEY, '1');

    // Le re-render de la même session ne bascule PAS la surface (flag figé à l'ouverture de séance)
    rerender(
      <DialerProvider token="mock-token" dryRun>
        <SessionWorkspace {...baseProps} />
      </DialerProvider>,
    );
    expect(screen.queryByTestId('session-workspace-v2')).toBeNull();

    // En revanche, ouvrir une nouvelle séance (changement d'id) applique la nouvelle version
    const newSession: SessionDetail = {
      ...mockSession,
      id: 99,
      name: 'Nouvelle séance',
    };
    rerender(
      <DialerProvider token="mock-token" dryRun>
        <SessionWorkspace {...baseProps} session={newSession} />
      </DialerProvider>,
    );
    expect(screen.getByTestId('session-workspace-v2')).toBeTruthy();
  });

  it('transmet la prop active=false au runner pour désactiver le listener sous pré-session', () => {
    const onFocusContact = vi.fn();
    renderWithDialer(
      <SessionWorkspace
        {...baseProps}
        active={false}
        onFocusContact={onFocusContact}
      />,
    );

    onFocusContact.mockClear();
    // Aucun déclenchement au clavier
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k' }));
    expect(onFocusContact).not.toHaveBeenCalled();
  });
});
