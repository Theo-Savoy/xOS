// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionContact, SessionDetail } from '../../../types';
import { DialerProvider } from '../../dialer/DialerProvider';
import { SessionWorkspaceV2 } from './SessionWorkspaceV2';
import type { SessionWorkspaceProps } from './types';

const session: SessionDetail = {
  id: 42,
  name: 'Séance File V2',
  status: 'active',
  created_at: '2026-07-10T10:00:00Z',
  rdv_goal: 4,
};

const contacts: SessionContact[] = [
  {
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
  },
  {
    id: 102,
    position: 1,
    sf_contact_id: 'sf-102',
    sf_account_id: 'acc-2',
    contact_name: 'Bob Durand',
    account_name: 'Bio Santé',
    phone: '+33687654321',
    email: 'bob@biosante.fr',
    title: 'Gérant',
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
  },
  {
    id: 103,
    position: 2,
    sf_contact_id: 'sf-103',
    sf_account_id: 'acc-3',
    contact_name: 'Claire Dupont',
    account_name: 'Nova SARL',
    phone: '+33699887766',
    email: null,
    title: 'Responsable Achats',
    linkedin_url: null,
    status: 'called',
    outcome: 'Appel argumenté',
    comments: null,
    sf_task_id: null,
    sf_event_id: null,
    called_at: '2026-07-10T11:00:00Z',
    claim_active: false,
    claimed_at: null,
    claimed_by: null,
  },
];

function makeProps(
  overrides: Partial<SessionWorkspaceProps> = {},
): SessionWorkspaceProps {
  return {
    session,
    contacts,
    hubSessions: [],
    currentContact: contacts[0]!,
    focusedContactId: contacts[0]!.id,
    variant: 'session',
    loading: false,
    error: null,
    awaitingEvent: null,
    contactContext: null,
    contextContactId: contacts[0]!.id,
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

function renderWorkspace(overrides: Partial<SessionWorkspaceProps> = {}) {
  const props = makeProps(overrides);
  render(
    <DialerProvider token="mock-token" dryRun>
      <SessionWorkspaceV2 {...props} />
    </DialerProvider>,
  );
  return props;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe('SessionWorkspaceV2 — L5A file étendue', () => {
  it('ouvre une surface outil depuis la file, sans créer un mode Liste concurrent', () => {
    renderWorkspace();

    expect(screen.queryByRole('dialog', { name: /file étendue/i })).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: /ouvrir la file étendue/i }),
    );

    const tool = screen.getByRole('dialog', { name: /file étendue/i });
    expect(tool).toBeTruthy();
    expect(within(tool).getByRole('list', { name: /file étendue/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^liste$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^fiche$/i })).toBeNull();
  });

  it('recherche et filtre les contacts dans la surface outil', () => {
    renderWorkspace();
    fireEvent.click(
      screen.getByRole('button', { name: /ouvrir la file étendue/i }),
    );
    const tool = screen.getByRole('dialog', { name: /file étendue/i });

    const search = within(tool).getByRole('searchbox', {
      name: /rechercher dans la file/i,
    });
    fireEvent.change(search, { target: { value: 'Bob' } });
    expect(within(tool).getByText('Bob Durand')).toBeTruthy();
    expect(within(tool).queryByText('Alice Martin')).toBeNull();

    fireEvent.change(search, { target: { value: '' } });
    fireEvent.click(within(tool).getByRole('button', { name: /^à faire$/i }));
    expect(within(tool).getByText('Alice Martin')).toBeTruthy();
    expect(within(tool).queryByText('Claire Dupont')).toBeNull();
  });

  it('maintient focus et sélection exclusifs, puis confirme l’abandon d’un formulaire dirty', () => {
    const props = renderWorkspace();
    const queue = screen.getByRole('region', { name: /file d'attente/i });
    fireEvent.click(
      screen.getByRole('button', { name: /ouvrir la file étendue/i }),
    );
    const tool = screen.getByRole('dialog', { name: /file étendue/i });

    fireEvent.click(
      within(tool).getByRole('checkbox', { name: /sélectionner alice/i }),
    );
    expect(within(tool).getByText('1 sélectionné')).toBeTruthy();

    fireEvent.change(
      within(tool).getByRole('textbox', { name: /commentaire groupé/i }),
      { target: { value: 'Conserver le contexte ACW' } },
    );
    fireEvent.click(within(queue).getByRole('button', { name: /bob durand/i }));

    expect(props.onFocusContact).not.toHaveBeenCalledWith(102);
    expect(
      screen.getByRole('dialog', { name: /abandonner la saisie groupée/i }),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole('button', { name: /continuer la saisie/i }),
    );
    expect(screen.getByRole('dialog', { name: /file étendue/i })).toBeTruthy();
    expect(props.onFocusContact).not.toHaveBeenCalledWith(102);

    fireEvent.click(within(queue).getByRole('button', { name: /bob durand/i }));
    fireEvent.click(screen.getByRole('button', { name: /abandonner/i }));
    expect(props.onFocusContact).toHaveBeenCalledWith(102);
    expect(screen.queryByRole('dialog', { name: /file étendue/i })).toBeNull();
  });
});
