// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

function openQueueTool() {
  fireEvent.click(
    screen.getByRole('button', { name: /ouvrir la file étendue/i }),
  );
  return screen.getByRole('dialog', { name: /file étendue/i });
}

function selectContact(
  tool: HTMLElement,
  contactName: string,
) {
  fireEvent.click(
    within(tool).getByRole('checkbox', {
      name: new RegExp(`sélectionner ${contactName}`, 'i'),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe('SessionWorkspaceV2 — L5A file étendue', () => {
  it('ouvre une surface outil depuis la file, sans créer un mode Liste concurrent', () => {
    renderWorkspace();

    expect(screen.queryByRole('dialog', { name: /file étendue/i })).toBeNull();
    const tool = openQueueTool();
    expect(tool).toBeTruthy();
    expect(within(tool).getByRole('list', { name: /file étendue/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^liste$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^fiche$/i })).toBeNull();
  });

  it('recherche et filtre les contacts dans la surface outil', () => {
    renderWorkspace();
    const tool = openQueueTool();

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
    const tool = openQueueTool();

    selectContact(tool, 'Alice Martin');
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

describe('SessionWorkspaceV2 — L5B actions bulk', () => {
  it('branche la consignation bulk sur onLogMany avec toute la sélection', () => {
    const onLogMany = vi.fn();
    const props = renderWorkspace({ onLogMany });
    const tool = openQueueTool();

    selectContact(tool, 'Alice Martin');
    selectContact(tool, 'Bob Durand');
    fireEvent.click(
      within(tool).getByRole('button', { name: 'Message répondeur' }),
    );
    fireEvent.change(
      within(tool).getByRole('textbox', { name: /commentaire groupé/i }),
      { target: { value: 'Note commune' } },
    );
    fireEvent.click(
      within(tool).getByRole('button', { name: /consigner pour 2/i }),
    );

    expect(onLogMany).toHaveBeenCalledTimes(1);
    expect(onLogMany).toHaveBeenCalledWith(
      [101, 102],
      expect.objectContaining({
        resultat: 'Message répondeur',
        comments: 'Note commune',
        doNotCall: false,
        recallAt: expect.any(String),
      }),
    );
    expect(within(tool).getByText('0 sélectionné')).toBeTruthy();
    expect(props.onFocusContact).not.toHaveBeenCalledWith(102);
  });

  it('C4 : la saisie bulk ne perd pas le focus à la première frappe (userEvent.type)', async () => {
    const user = userEvent.setup();
    renderWorkspace();
    const tool = openQueueTool();
    selectContact(tool, 'Alice Martin');

    const comments = within(tool).getByRole('textbox', {
      name: /commentaire groupé/i,
    });
    await user.type(comments, 'Note commune');

    // C4 : le focus DOIT rester dans le textarea (pas volé par ✕), texte complet
    expect(comments).toHaveProperty('value', 'Note commune');
    expect(document.activeElement).toBe(comments);
  });

  it('désactive RDV pour une sélection multiple et expose les erreurs partielles', () => {
    renderWorkspace();
    const tool = openQueueTool();
    selectContact(tool, 'Alice Martin');
    selectContact(tool, 'Bob Durand');

    expect(
      within(tool).getByRole('button', { name: 'RDV planifié' }),
    ).toHaveProperty('disabled', true);
  });

  it('branche le report sur onDeferContacts avec la séance de continuation', () => {
    const onDeferContacts = vi.fn();
    const props = makeProps({ onDeferContacts });
    render(
      <DialerProvider token="mock-token" dryRun>
        <SessionWorkspaceV2 {...props} />
      </DialerProvider>,
    );
    const tool = openQueueTool();
    selectContact(tool, 'Alice Martin');
    selectContact(tool, 'Bob Durand');
    fireEvent.click(within(tool).getByRole('button', { name: /^Reporter$/i }));

    const defer = within(tool).getByRole('region', {
      name: /reporter les contacts/i,
    });
    fireEvent.click(
      within(defer).getByRole('button', {
        name: /créer séance file v2 #2/i,
      }),
    );

    expect(onDeferContacts).toHaveBeenCalledWith(
      [101, 102],
      expect.objectContaining({
        scheduledFor: expect.any(String),
        targetSessionId: null,
        name: 'Séance File V2 #2',
      }),
    );
    expect(props.onFocusContact).not.toHaveBeenCalledWith(102);
  });

  it('applique les rappels rapides et date via onUpdateRecall', () => {
    const recallContacts = contacts.map((contact) => ({
      ...contact,
      status: 'called' as const,
      outcome: 'Appel argumenté' as const,
      recall_at: '2026-09-10',
      claim_active: false,
    }));
    const onUpdateRecall = vi.fn();
    renderWorkspace({
      contacts: recallContacts,
      currentContact: recallContacts[0]!,
      focusedContactId: recallContacts[0]!.id,
      onUpdateRecall,
    });
    const tool = openQueueTool();
    selectContact(tool, 'Alice Martin');
    fireEvent.click(
      within(tool).getByRole('button', { name: /rappel aujourd'hui/i }),
    );
    expect(onUpdateRecall).toHaveBeenCalledWith(
      [101],
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    );

    selectContact(tool, 'Bob Durand');
    fireEvent.click(
      within(tool).getByRole('button', { name: /date du rappel groupé/i }),
    );
    const calendar = within(tool).getByRole('dialog', {
      name: /date du rappel groupé/i,
    });
    fireEvent.click(within(calendar).getByRole('button', { name: /aujourd'hui/i }));
    expect(onUpdateRecall).toHaveBeenLastCalledWith(
      [102],
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    );
  });

  it('empêche le retrait d’un contact claimé par un autre agent', () => {
    const claimedContacts = contacts.map((contact, index) => ({
      ...contact,
      claim_active: index === 0,
      claimed_by: index === 0 ? 'user-other' : null,
      claimed_by_label: index === 0 ? 'Maya' : null,
    }));
    const onRemoveContacts = vi.fn();
    renderWorkspace({
      contacts: claimedContacts,
      currentContact: claimedContacts[0]!,
      focusedContactId: claimedContacts[0]!.id,
      currentUserId: 'user-me',
      onRemoveContacts,
    });
    const tool = openQueueTool();
    expect(
      within(tool).getByRole('checkbox', {
        name: /sélectionner alice martin/i,
      }),
    ).toHaveProperty('disabled', true);
    selectContact(tool, 'Bob Durand');
    fireEvent.click(
      within(tool).getByRole('button', { name: /retirer la sélection/i }),
    );
    expect(onRemoveContacts).toHaveBeenCalledWith([102]);
    expect(onRemoveContacts).not.toHaveBeenCalledWith(
      expect.arrayContaining([101]),
    );
  });

  it('affiche l’erreur partielle fournie par CallManagerApp dans l’overlay', () => {
    renderWorkspace({
      error: '1 consigné, 1 en échec — liste actualisée',
    });
    const tool = openQueueTool();
    expect(within(tool).getByRole('alert').textContent).toContain(
      '1 consigné, 1 en échec — liste actualisée',
    );
  });
});
