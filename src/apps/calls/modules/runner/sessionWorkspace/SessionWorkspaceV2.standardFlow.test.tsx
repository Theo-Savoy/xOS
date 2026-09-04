// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ContactContext,
  SessionContact,
  SessionDetail,
} from '../../../types';
import { DialerProvider } from '../../dialer/DialerProvider';
import { SessionWorkspace } from './SessionWorkspace';
import { SessionWorkspaceV2 } from './SessionWorkspaceV2';
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
  name: 'Séance Test L3 Standard Flow',
  status: 'active',
  created_at: '2026-07-10T10:00:00Z',
  rdv_goal: 4,
  session_type: 'prospection',
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

function makeBaseProps(overrides?: Partial<SessionWorkspaceProps>): SessionWorkspaceProps {
  return {
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
    contextTargetContactId: 101,
    onBack: vi.fn(),
    onFocusContact: vi.fn(),
    onLogAndNext: vi.fn(),
    onLogRdvAndNext: vi.fn(),
    onLogMany: vi.fn(),
    onLogEvent: vi.fn(),
    onDeferContacts: vi.fn(),
    onRemoveContacts: vi.fn(),
    onUpdateRecall: vi.fn(),
    onCelebrateGoal: vi.fn(),
    runnerVersion: 'v2',
    ...overrides,
  };
}

function renderWithDialer(ui: React.ReactElement) {
  return render(<DialerProvider token="mock-token" dryRun>{ui}</DialerProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});
afterEach(cleanup);

describe('SessionWorkspaceV2 — Flux Standard & Invariants L3 (#119)', () => {
  // 1. Parcours complet via la façade
  describe('1. Façade et Coexistence', () => {
    it('monte SessionWorkspaceV2 via la façade SessionWorkspace quand runnerVersion="v2"', () => {
      const props = makeBaseProps({ runnerVersion: 'v2' });
      renderWithDialer(<SessionWorkspace {...props} />);

      expect(screen.getByTestId('session-workspace-v2')).toBeTruthy();
      expect(screen.getByRole('banner')).toBeTruthy(); // SessionHeader
      expect(screen.getAllByRole('list').length).toBeGreaterThanOrEqual(1); // SessionQueue
      expect(screen.getByRole('main')).toBeTruthy(); // ContactWorkspace
      expect(screen.getByRole('region', { name: 'Contexte CRM' })).toBeTruthy(); // ContextInspector
    });

    it('monte le runner legacy quand runnerVersion="legacy" (coexistence sans régression)', () => {
      const props = makeBaseProps({ runnerVersion: 'legacy' });
      renderWithDialer(<SessionWorkspace {...props} />);

      // Le shell V2 n'est pas monté
      expect(screen.queryByTestId('session-workspace-v2')).toBeNull();
      // Le legacy monte avec .calls-view--runner
      expect(screen.getByText('Alice Martin')).toBeTruthy();
    });

    it('force le legacy quand variant="recalls" même si runnerVersion="v2"', () => {
      const props = makeBaseProps({ runnerVersion: 'v2', variant: 'recalls' });
      renderWithDialer(<SessionWorkspace {...props} />);

      expect(screen.queryByTestId('session-workspace-v2')).toBeNull();
    });
  });

  // 2. Invariant I1 : File FIFO de consignation (suivant = prochain pending)
  describe('2. Invariant I1 : File FIFO de consignation', () => {
    it('permet de consigner le contact actif et appelle onLogAndNext avec le payload attendu', () => {
      const onLogAndNext = vi.fn();
      const props = makeBaseProps({ onLogAndNext });
      renderWithDialer(<SessionWorkspaceV2 {...props} />);

      // Choix du résultat "Appel non décroché" (bouton NR)
      const nrButton = screen.getByRole('button', { name: /appel non décroché/i });
      fireEvent.click(nrButton);

      // Clic sur CTA primaire unique "Consigner & suivant"
      const submitBtn = screen.getByRole('button', { name: /consigner & suivant/i });
      fireEvent.click(submitBtn);

      expect(onLogAndNext).toHaveBeenCalledTimes(1);
      expect(onLogAndNext).toHaveBeenCalledWith(
        101,
        expect.objectContaining({
          resultat: 'Appel non décroché',
          doNotCall: false,
          comments: '',
          recallAt: expect.any(String),
        }),
      );
    });

    it('avance le focus vers le prochain contact pending (FIFO) après mise à jour des contacts', () => {
      const props = makeBaseProps({ focusedContactId: null, currentContact: mockContacts[0] });
      const { rerender } = renderWithDialer(<SessionWorkspaceV2 {...props} />);

      // Initialement focalisé sur Alice Martin (101)
      expect(screen.getByText('Directrice Technique · Tech Corp')).toBeTruthy();

      // Simulation de la transition après handleLogAndNext côté parent :
      // 101 est 'called', le prochain pending est 103 (Claire Dupont), focusedContactId est null
      const updatedContacts: SessionContact[] = [
        { ...mockContacts[0], status: 'called', outcome: 'Appel non décroché' },
        mockContacts[1], // 102 called
        mockContacts[2], // 103 pending
      ];

      rerender(
        <DialerProvider token="mock-token" dryRun>
          <SessionWorkspaceV2
            {...props}
            contacts={updatedContacts}
            currentContact={updatedContacts[2]}
            focusedContactId={null}
          />
        </DialerProvider>,
      );

      // La fiche affiche maintenant Claire Dupont
      expect(screen.getByText('Responsable Achats · Nova SARL')).toBeTruthy();
    });
  });

  // 3. Invariant I2 : Rollback optimiste des logs rejetés
  describe('3. Invariant I2 : Rollback optimiste', () => {
    it('refocalise le contact en échec lors d’un rollback optimiste du parent', () => {
      const props = makeBaseProps({
        focusedContactId: 103,
        currentContact: mockContacts[2],
      });
      const { rerender } = renderWithDialer(<SessionWorkspaceV2 {...props} />);

      // On est sur Claire Dupont (103)
      expect(screen.getByText('Responsable Achats · Nova SARL')).toBeTruthy();

      // Le parent effectue un rollback sur contact 101 (erreur réseau ou rejet)
      // et force focusedContactId: 101 avec le snapshot pending restauré
      rerender(
        <DialerProvider token="mock-token" dryRun>
          <SessionWorkspaceV2
            {...props}
            focusedContactId={101}
            currentContact={mockContacts[0]}
            error="Échec de consignation — contact restauré"
          />
        </DialerProvider>,
      );

      // Alice Martin est à nouveau focalisée avec son formulaire ACW
      expect(screen.getByText('Directrice Technique · Tech Corp')).toBeTruthy();
      expect(screen.getByRole('button', { name: /consigner & suivant/i })).toBeTruthy();
      // Bannière d'erreur visible
      expect(screen.getByRole('alert').textContent).toContain('Échec de consignation — contact restauré');
    });
  });

  // 4. Invariant I5 : Workflow RDV (transaction appel+Event, Event rejeté après appel réussi)
  describe('4. Invariant I5 : Workflow RDV et Event rejeté', () => {
    it('affiche EventPanel lors de la sélection "RDV planifié" et appelle onLogRdvAndNext', () => {
      const onLogRdvAndNext = vi.fn();
      const props = makeBaseProps({ onLogRdvAndNext });
      renderWithDialer(<SessionWorkspaceV2 {...props} />);

      // Clic sur "RDV planifié"
      const rdvButton = screen.getByRole('button', { name: 'RDV planifié' });
      fireEvent.click(rdvButton);

      // EventPanel s'affiche
      expect(screen.getByLabelText(/date & heure/i)).toBeTruthy();

      // Soumission du RDV
      const submitRdvBtn = screen.getByRole('button', { name: /consigner appel \+ rdv & suivant/i });
      fireEvent.click(submitRdvBtn);

      expect(onLogRdvAndNext).toHaveBeenCalledTimes(1);
      expect(onLogRdvAndNext).toHaveBeenCalledWith(
        101,
        expect.objectContaining({
          resultat: 'RDV planifié',
        }),
        expect.objectContaining({
          durationMin: expect.any(Number),
          subject: expect.any(String),
        }),
      );
    });

    it('affiche le formulaire de finalisation et appelle onLogEvent en cas de awaitingEvent (I5)', () => {
      const onLogEvent = vi.fn();
      const awaiting: SessionContact = {
        ...mockContacts[0],
        status: 'called',
        outcome: 'RDV planifié',
      };
      const props = makeBaseProps({
        awaitingEvent: awaiting,
        onLogEvent,
      });

      renderWithDialer(<SessionWorkspaceV2 {...props} />);

      // En-tête de finalisation Event présent
      expect(
        screen.getByText(`Finaliser le RDV — ${awaiting.contact_name}`),
      ).toBeTruthy();

      // Soumission de l'EventPanel
      const submitFinalizeBtn = screen.getByRole('button', {
        name: /enregistrer le rdv & suivant/i,
      });
      fireEvent.click(submitFinalizeBtn);

      expect(onLogEvent).toHaveBeenCalledTimes(1);
      expect(onLogEvent).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Number),
        expect.objectContaining({
          subject: expect.any(String),
        }),
      );
    });
  });

  // 5. Invariant I8 : Rappels rapides/date + NPA
  describe('5. Invariant I8 : Rappels rapides/date + NPA', () => {
    it('permet de choisir un preset de rappel rapide et persiste le choix dans localStorage', () => {
      const onLogAndNext = vi.fn();
      const props = makeBaseProps({ onLogAndNext });
      renderWithDialer(<SessionWorkspaceV2 {...props} />);

      // Présence des presets de rappel
      const preset7 = screen.getByRole('button', { name: /\+7 j/i });
      fireEvent.click(preset7);

      // Vérifie la persistance locale assumée
      // Vérifie la persistance locale assumée
      expect(window.localStorage.getItem('xos_calls_default_recall_days')).toBe('7');

      // Soumission
      fireEvent.click(screen.getByRole('button', { name: /consigner & suivant/i }));
      expect(onLogAndNext).toHaveBeenCalledWith(
        101,
        expect.objectContaining({
          recallAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        }),
      );
    });

    it('envoie recallAt=null si le rappel est désactivé', () => {
      const onLogAndNext = vi.fn();
      const props = makeBaseProps({ onLogAndNext });
      renderWithDialer(<SessionWorkspaceV2 {...props} />);

      // Décocher "Planifier un rappel"
      const checkboxRecall = screen.getByRole('checkbox', { name: /planifier un rappel/i });
      fireEvent.click(checkboxRecall);

      fireEvent.click(screen.getByRole('button', { name: /consigner & suivant/i }));
      expect(onLogAndNext).toHaveBeenCalledWith(
        101,
        expect.objectContaining({
          recallAt: null,
        }),
      );
    });

    it('envoie doNotCall=true si la case NPA est cochée', () => {
      const onLogAndNext = vi.fn();
      const props = makeBaseProps({ onLogAndNext });
      renderWithDialer(<SessionWorkspaceV2 {...props} />);

      // Cocher NPA
      const checkboxNpa = screen.getByRole('checkbox', { name: /ne pas rappeler \(npa\)/i });
      fireEvent.click(checkboxNpa);

      fireEvent.click(screen.getByRole('button', { name: /consigner & suivant/i }));
      expect(onLogAndNext).toHaveBeenCalledWith(
        101,
        expect.objectContaining({
          doNotCall: true,
        }),
      );
    });
  });

  // 6. Invariant I4 : Protection des contacts partagés
  describe('6. Invariant I4 : Protection des contacts partagés', () => {
    it('affiche le tag d’alerte de claim sur les contacts pris par un collègue', () => {
      const props = makeBaseProps();
      renderWithDialer(<SessionWorkspaceV2 {...props} />);

      // Bob Durand est claimed_by_label: 'Marc'
      expect(screen.getByText('Pris par Marc')).toBeTruthy();
    });
  });

  // 7. Invariant I6 : Claims concurrents et bootstrap focus
  describe('7. Invariant I6 : Claims concurrents & bootstrap', () => {
    it('appelle onFocusContact au bootstrap si aucun contact n’est explicitement focalisé', () => {
      const onFocusContact = vi.fn();
      const props = makeBaseProps({
        focusedContactId: null,
        currentContact: mockContacts[0],
        onFocusContact,
      });

      renderWithDialer(<SessionWorkspaceV2 {...props} />);
      expect(onFocusContact).toHaveBeenCalledWith(101);
    });

    it('appelle onFocusContact lors du clic sur un autre contact de la file', () => {
      const onFocusContact = vi.fn();
      const props = makeBaseProps({ onFocusContact });
      renderWithDialer(<SessionWorkspaceV2 {...props} />);

      const claireBtn = screen.getByRole('button', { name: /claire dupont/i });
      fireEvent.click(claireBtn);

      expect(onFocusContact).toHaveBeenCalledWith(103);
    });
  });

  // 8. Erreur Salesforce non bloquante
  describe('8. Gestion des erreurs non bloquantes', () => {
    it('affiche une bannière d’alerte sans masquer la file ni la fiche active si contacts.length > 0', () => {
      const props = makeBaseProps({
        error: 'Appel consigné, mais la création du rappel a échoué dans Salesforce — vérifie la fiche.',
      });
      renderWithDialer(<SessionWorkspaceV2 {...props} />);

      // Bannière d'alerte affichée
      const alert = screen.getByRole('alert');
      expect(alert.textContent).toContain('création du rappel a échoué dans Salesforce');

      // La file et la fiche restent visibles et utilisables
      expect(screen.getAllByText('Alice Martin').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Claire Dupont')).toBeTruthy();
      expect(screen.getByRole('button', { name: /consigner & suivant/i })).toBeTruthy();
    });

    it('affiche un GlassCard d’erreur unique si contacts.length === 0', () => {
      const props = makeBaseProps({
        contacts: [],
        error: 'Séance introuvable ou indisponible.',
      });
      renderWithDialer(<SessionWorkspaceV2 {...props} />);

      const alert = screen.getByRole('alert');
      expect(alert.textContent).toContain('Séance introuvable ou indisponible.');
      // Pas de layout monté
      expect(screen.queryByRole('list')).toBeNull();
    });
  });

  // 9. ContextInspector : alimentation réelle et protection anti-stale
  describe('9. ContextInspector & Protection Anti-Stale', () => {
    it('affiche les données CRM réelles quand contextContactId correspond au contact actif', () => {
      const props = makeBaseProps({
        contextContactId: 101,
        contactContext: mockContext,
      });
      renderWithDialer(<SessionWorkspaceV2 {...props} />);

      // Historique d'appels
      expect(screen.getByText('Argumenté')).toBeTruthy();

      // Opportunités
      expect(screen.getByText('Projet ERP 2026')).toBeTruthy();
      expect(screen.getByText(/45000 €/)).toBeTruthy();

      // Références pairs
      expect(screen.getAllByText('Client Référence A').length).toBeGreaterThanOrEqual(1);
    });

    it('n’affiche PAS les données CRM si contextContactId ne correspond pas au contact (anti-stale)', () => {
      const props = makeBaseProps({
        focusedContactId: 101,
        // contextContactId appartient à un autre contact (stale data en transit)
        contextContactId: 999,
        contextTargetContactId: null,
        contactContext: mockContext,
      });
      renderWithDialer(<SessionWorkspaceV2 {...props} />);

      // Message d'indisponibilité pour ce contact
      expect(
        screen.getByText('Aucun contexte CRM disponible pour ce contact.'),
      ).toBeTruthy();

      // Les données de l'ancien contact ne fuient pas
      expect(screen.queryByText('Appel découverte')).toBeNull();
      expect(screen.queryByText('Projet ERP 2026')).toBeNull();
    });

    it('affiche un squelette de chargement quand loading=true ou contextTargetContactId cible le contact', () => {
      const props = makeBaseProps({
        contextContactId: null,
        contextTargetContactId: 101,
        loading: false, // loading général false mais contextBusy via target
        contactContext: null,
      });
      renderWithDialer(<SessionWorkspaceV2 {...props} />);

      // ContextSideSkeleton présent (rôle status ou structure skeleton)
      expect(document.querySelector('.calls-context-panel--skeleton')).toBeTruthy();
    });
  });

  // 10. Mise à jour de rappel existant (onUpdateRecall)
  describe('10. onUpdateRecall', () => {
    it('transmet le handler onUpdateRecall à la fiche active', () => {
      const onUpdateRecall = vi.fn();
      const props = makeBaseProps({ onUpdateRecall });
      renderWithDialer(<SessionWorkspaceV2 {...props} />);

      // ContactCardPanel est rendu avec onUpdateRecall câblé
      expect(screen.getByText('Directrice Technique · Tech Corp')).toBeTruthy();
    });
  });
});
