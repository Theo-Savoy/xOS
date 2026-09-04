// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ContactContext,
  SessionContact,
  SessionDetail,
} from '../../../types';
import { DialerProvider } from '../../dialer/DialerProvider';
import { PowerWorkspace } from './PowerWorkspace';
import { SessionQueue } from './SessionQueue';
import { SessionWorkspaceV2 } from './SessionWorkspaceV2';
import type { SessionWorkspaceProps } from './types';

const v2Css = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('node:fs') as typeof import('node:fs');
  return fs.readFileSync('src/apps/calls/calls-workspace-v2.css', 'utf8');
});
const mockSession: SessionDetail = {
  id: 42,
  name: 'Séance V2 Test',
  status: 'active',
  created_at: '2026-07-10T10:00:00Z',
  rdv_goal: 4,
};

const mockContacts: SessionContact[] = [
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
    status: 'called',
    outcome: 'RDV planifié',
    comments: 'RDV fixé mardi',
    sf_task_id: null,
    sf_event_id: null,
    called_at: '2026-07-10T11:00:00Z',
    claim_active: true,
    claimed_at: '2026-07-10T10:30:00Z',
    claimed_by: 'user-2',
    claimed_by_label: 'Marc',
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
];

const mockContext: ContactContext = {
  contact_record_url: 'https://salesforce.com/sf-101',
  account_record_url: 'https://salesforce.com/acc-1',
  email: 'alice@techcorp.com',
  title: 'Directrice Technique',
  account_name: 'Tech Corp',
  industry: 'Logiciel',
  npa: false,
  tasks: [
    {
      id: 'task-1',
      subject: 'Appel découverte',
      result: 'Argumenté',
      description: null,
      activity_date: '2026-06-15',
      record_url: 'https://salesforce.com/task-1',
    },
  ],
  opportunities: [
    {
      id: 'opp-1',
      name: 'Projet ERP 2026',
      stage_name: 'Proposition',
      is_closed: false,
      is_won: false,
      amount: 45000,
      close_date: '2026-10-01',
      record_url: 'https://salesforce.com/opp-1',
    },
  ],
  peer_clients: [
    {
      id: 'peer-1',
      name: 'Client Référence A',
      industry: 'Logiciel',
      record_url: 'https://salesforce.com/peer-1',
    },
  ],
};

const baseProps: SessionWorkspaceProps = {
  session: mockSession,
  contacts: mockContacts,
  hubSessions: [],
  currentContact: mockContacts[0],
  focusedContactId: 101,
  loading: false,
  error: null,
  awaitingEvent: null,
  contactContext: mockContext,
  contextContactId: 101,
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
  vi.clearAllMocks();
});

afterEach(cleanup);

describe('SessionWorkspaceV2 — Shell et Architecture (Issue #119 - Lot L2)', () => {
  it('monte la structure complète avec les rôles a11y appropriés', () => {
    renderWithDialer(<SessionWorkspaceV2 {...baseProps} />);

    // Région racine V2
    const workspace = screen.getByTestId('session-workspace-v2');
    expect(workspace).toBeTruthy();
    expect(workspace.getAttribute('role')).toBe('region');

    // Régions enfants : Header (banner), Queue, Contact (main), Inspector
    expect(screen.getByRole('banner', { name: /en-tête de séance/i })).toBeTruthy();
    expect(screen.getByRole('region', { name: /file d'attente/i })).toBeTruthy();
    expect(screen.getByRole('main', { name: /fiche du contact actif/i })).toBeTruthy();
    expect(screen.getByRole('region', { name: /contexte crm/i })).toBeTruthy();
  });

  it('ZÉRO toggle Liste/Fiche dans la V2 (D1)', () => {
    renderWithDialer(<SessionWorkspaceV2 {...baseProps} />);

    // Aucun groupe d'affichage Liste / Fiche
    expect(screen.queryByRole('group', { name: /mode d'affichage/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^liste$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^fiche$/i })).toBeNull();
  });

  it('affiche le nom de séance et la progression condensée une ligne « 1/3 · 1/4 RDV »', () => {
    renderWithDialer(<SessionWorkspaceV2 {...baseProps} />);

    // Titre de la séance
    expect(screen.getByText('Séance V2 Test')).toBeTruthy();

    // Progression condensée : 1 traité sur 3, 1 RDV sur 4 objectif
    expect(screen.getByText('1/3 · 1/4 RDV')).toBeTruthy();
  });

  it('fournit un bouton Quitter appelant onBack', () => {
    const onBack = vi.fn();
    renderWithDialer(<SessionWorkspaceV2 {...baseProps} onBack={onBack} />);

    const backBtn = screen.getByRole('button', { name: /retour aux séances/i });
    fireEvent.click(backBtn);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('regroupe les utilitaires (partage, épinglage, aide) AU MENU uniquement', () => {
    const onPin = vi.fn().mockResolvedValue(undefined);
    const onShare = vi.fn().mockResolvedValue(undefined);
    renderWithDialer(
      <SessionWorkspaceV2
        {...baseProps}
        onPin={onPin}
        onShareSession={onShare}
        currentUserId="user-1"
      />,
    );

    // Les boutons ne sont PAS directement dans le header
    expect(screen.queryByRole('button', { name: 'Partager la séance' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Épingler la séance' })).toBeNull();

    // Clic sur le bouton de menu utilitaires
    const menuBtn = screen.getByRole('button', {
      name: /menu utilitaires de la séance/i,
    });
    fireEvent.click(menuBtn);

    // Les items du menu apparaissent
    expect(screen.getByRole('menuitem', { name: /partager la séance/i })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /épingler la séance/i })).toBeTruthy();
    expect(
      screen.getByRole('menuitem', { name: /aide & raccourcis clavier/i }),
    ).toBeTruthy();

    // Clic sur épingler
    fireEvent.click(screen.getByRole('menuitem', { name: /épingler la séance/i }));
    expect(onPin).toHaveBeenCalledTimes(1);
  });

  it('SessionQueue : affiche les contacts, statut, badge claim, et réagit au clic de focus', () => {
    const onFocusContact = vi.fn();
    renderWithDialer(
      <SessionWorkspaceV2 {...baseProps} onFocusContact={onFocusContact} />,
    );
    // Contacts affichés dans la file et la fiche active
    expect(screen.getAllByText('Alice Martin').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Bob Durand').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Claire Dupont')).toBeTruthy();
    // Badge claim présent sur Bob
    expect(screen.getByText('Pris par Marc')).toBeTruthy();

    // Clic sur Claire Dupont pour changer de focus
    fireEvent.click(screen.getByRole('button', { name: /claire dupont/i }));
    expect(onFocusContact).toHaveBeenCalledWith(103);
  });

  it('ContactWorkspace : affiche la fiche active et le formulaire ACW avec CTA primaire unique', () => {
    const onLogAndNext = vi.fn();
    renderWithDialer(
      <SessionWorkspaceV2 {...baseProps} onLogAndNext={onLogAndNext} />,
    );
    // Fiche active (Alice Martin)
    expect(screen.getAllByText('Alice Martin').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/Directrice Technique · Tech Corp/)).toBeTruthy();
    // Bouton d'action appel séquentiel disponible
    expect(screen.getByRole('button', { name: 'Appeler' })).toBeTruthy();

    // Formulaire ACW
    expect(screen.getByText("Consigner l'appel")).toBeTruthy();
    const submitBtn = screen.getByRole('button', {
      name: /consigner & suivant/i,
    });
    expect(submitBtn).toBeTruthy();

    // Clic sur Consigner & suivant
    fireEvent.click(submitBtn);
    expect(onLogAndNext).toHaveBeenCalledWith(
      101,
      expect.objectContaining({
        resultat: 'Appel non décroché',
        doNotCall: false,
      }),
    );
  });

  it('ContactWorkspace : affiche l’état déjà consigné pour un contact traité', () => {
    renderWithDialer(
      <SessionWorkspaceV2 {...baseProps} focusedContactId={102} />,
    );
    // Bob Durand est déjà appelé avec RDV
    expect(screen.getAllByText('Bob Durand').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Consigné')).toBeTruthy();
    expect(screen.getAllByText('RDV planifié').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('RDV fixé mardi')).toBeTruthy();
  });

  it('ContextInspector : affiche l’historique d’appels et opportunités en lecture', () => {
    renderWithDialer(<SessionWorkspaceV2 {...baseProps} />);

    expect(screen.getByText("Historique d'appels")).toBeTruthy();
    expect(screen.getByText('Argumenté')).toBeTruthy();
    expect(screen.getByText('Opportunités du compte')).toBeTruthy();
    expect(screen.getByText('Projet ERP 2026')).toBeTruthy();
    expect(screen.getByText('Références clients du secteur')).toBeTruthy();
    expect(screen.getAllByText('Client Référence A').length).toBeGreaterThanOrEqual(1);
  });

  it('gère l’état de chargement initial (loading=true, contacts=[])', () => {
    renderWithDialer(
      <SessionWorkspaceV2 {...baseProps} contacts={[]} loading={true} />,
    );

    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('gère l’état d’erreur (error="Erreur réseau")', () => {
    renderWithDialer(
      <SessionWorkspaceV2
        {...baseProps}
        contacts={[]}
        error="Impossible de charger la séance"
      />,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toBeTruthy();
    expect(alert.textContent).toContain('Impossible de charger la séance');
  });

  it('gère l’état de séance vide (contacts=[])', () => {
    renderWithDialer(<SessionWorkspaceV2 {...baseProps} contacts={[]} />);

    expect(screen.getByText('Séance vide')).toBeTruthy();
  });

  it('ouvre les sheets responsive Contexte CRM et File d’attente', () => {
    renderWithDialer(<SessionWorkspaceV2 {...baseProps} />);

    // Déclencheur Contexte CRM
    const inspectorToggle = screen.getByRole('button', {
      name: /ouvrir le contexte crm/i,
    });
    fireEvent.click(inspectorToggle);

    // Le bouton de fermeture de sheet est présent
    const closeInspector = screen.getByRole('button', {
      name: /fermer le contexte crm/i,
    });
    expect(closeInspector).toBeTruthy();
    fireEvent.click(closeInspector);

    // Déclencheur File d'attente
    const queueToggle = screen.getByRole('button', {
      name: /ouvrir la file d'attente/i,
    });
    fireEvent.click(queueToggle);

    const closeQueue = screen.getByRole('button', {
      name: /fermer la file d'attente/i,
    });
    expect(closeQueue).toBeTruthy();
    fireEvent.click(closeQueue);
  });

  it('Grok note a : SessionWorkspaceV2 force le legacy quand variant="recalls"', () => {
    const { container } = renderWithDialer(
      <SessionWorkspaceV2 {...baseProps} variant="recalls" />,
    );

    // Rendu RunnerView historique, pas la structure V2
    expect(container.querySelector('.calls-view--runner')).toBeTruthy();
    // Le badge condensé de la V2 n'est pas présent
    expect(screen.queryByText('1/3 · 1/4 RDV')).toBeNull();
  });

  it('Grok note b : replie le rail de file (SessionQueue) quand isCollapsed=true', () => {
    const { rerender } = renderWithDialer(
      <SessionQueue
        contacts={mockContacts}
        focusedContactId={101}
        onFocusContact={vi.fn()}
        isCollapsed={false}
      />,
    );
    expect(screen.getByRole('region', { name: /file d'attente/i })).toBeTruthy();

    // Repli en conversation / ACW
    rerender(
      <DialerProvider token="mock-token" dryRun>
        <SessionQueue
          contacts={mockContacts}
          focusedContactId={101}
          onFocusContact={vi.fn()}
          isCollapsed={true}
        />
      </DialerProvider>,
    );
    expect(screen.queryByRole('region', { name: /file d'attente/i })).toBeNull();
  });

  it('PowerWorkspace : replié en conversation et en acw, affiche le panel en ready', () => {
    const { rerender } = renderWithDialer(
      <PowerWorkspace
        isPowerActive={true}
        powerUiState="ready"
        canPowerDialer={true}
      />,
    );
    expect(screen.getByRole('region', { name: /console power/i })).toBeTruthy();
    expect(screen.getByText(/ready/i)).toBeTruthy();

    // Replié en conversation
    rerender(
      <DialerProvider token="mock-token" dryRun>
        <PowerWorkspace
          isPowerActive={true}
          powerUiState="conversation"
          canPowerDialer={true}
        />
      </DialerProvider>,
    );
    expect(screen.queryByRole('region', { name: /console power/i })).toBeNull();

    // Replié en ACW
    rerender(
      <DialerProvider token="mock-token" dryRun>
        <PowerWorkspace
          isPowerActive={true}
          powerUiState="acw"
          canPowerDialer={true}
        />
      </DialerProvider>,
    );
    expect(screen.queryByRole('region', { name: /console power/i })).toBeNull();
  });

  it('valide la conformité CSS V2 : tokens, container queries et absence de tokens fantômes', () => {
    // Scoping sous .calls-workspace--v2
    expect(v2Css).toContain('.calls-workspace--v2');
    // Container queries basées sur .calls-app
    expect(v2Css).toContain('@container calls-app (max-width: 899px) and (min-width: 720px)');
    expect(v2Css).toContain('@container calls-app (max-width: 719px)');
    // Tokens existants uniquement (pas d'appel à des tokens fantômes)
    expect(v2Css).not.toMatch(/var\(--xos-radius-pill\)/);
    expect(v2Css).not.toMatch(/var\(--xos-surface-3\)/);
    // Utilisation de l'échelle d'espacement standard
    expect(v2Css).toContain('var(--xos-space-4)');
    expect(v2Css).toContain('var(--xos-radius-md)');
  });
});
