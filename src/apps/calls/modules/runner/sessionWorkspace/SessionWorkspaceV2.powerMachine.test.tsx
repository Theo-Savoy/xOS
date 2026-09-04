// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionContact, SessionDetail } from '../../../types';
import { DialerProvider } from '../../dialer/DialerProvider';
import { SessionWorkspaceV2 } from './SessionWorkspaceV2';
import type { SessionWorkspaceProps } from './types';

const { mockUseDialerPool, mockFetchDialerConfig, mockPlayComboSound } =
  vi.hoisted(() => ({
    mockUseDialerPool: vi.fn(),
    mockFetchDialerConfig: vi.fn(),
    mockPlayComboSound: vi.fn(),
  }));

vi.mock('../../gamification/comboSounds', () => ({
  playComboSound: mockPlayComboSound,
}));
vi.mock('../../gamification/comboKeyboard', () => ({
  readSoundsEnabled: () => true,
}));
vi.mock('../../dialer/application/useDialerPool', () => ({
  useDialerPool: mockUseDialerPool,
}));
vi.mock('../../dialer/dialerApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../dialer/dialerApi')>()),
  fetchDialerConfig: mockFetchDialerConfig,
}));

const mockSession: SessionDetail = {
  id: 42,
  name: 'Séance V2 Power Test',
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
    phone: '+33100000001',
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
    phone: '+33100000002',
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
];

let poolState: {
  size: number;
  running: boolean;
  error: string | null;
  queue: string[];
  lines: Array<{
    slot: number;
    phase: 'idle' | 'dialing' | 'ringing' | 'connected' | 'ended' | 'skipped' | 'failed';
    destination: string;
    error: string | null;
  }>;
};

let poolMockHandlers: {
  setQueue: ReturnType<typeof vi.fn>;
  play: ReturnType<typeof vi.fn>;
  skip: ReturnType<typeof vi.fn>;
  hangupAll: ReturnType<typeof vi.fn>;
  redial: ReturnType<typeof vi.fn>;
  isRunning: boolean;
  agentConnected: boolean;
  hangupRetryable: boolean;
  winnerContactId: number | null;
};

function setupPool(overrides: Partial<typeof poolMockHandlers> = {}, stateOverrides: Partial<typeof poolState> = {}) {
  poolState = {
    size: 3,
    running: false,
    error: null,
    queue: ['+33100000001', '+33100000002'],
    lines: [
      { slot: 0, phase: 'idle', destination: '', error: null },
      { slot: 1, phase: 'idle', destination: '', error: null },
      { slot: 2, phase: 'idle', destination: '', error: null },
    ],
    ...stateOverrides,
  };

  poolMockHandlers = {
    setQueue: vi.fn(),
    play: vi.fn(),
    skip: vi.fn(),
    hangupAll: vi.fn(),
    redial: vi.fn(),
    isRunning: poolState.running,
    agentConnected: false,
    hangupRetryable: false,
    winnerContactId: null,
    ...overrides,
  };

  mockUseDialerPool.mockImplementation(() => ({
    state: poolState,
    ...poolMockHandlers,
  }));
}

function renderWorkspace(props: Partial<SessionWorkspaceProps> = {}) {
  const baseProps: SessionWorkspaceProps = {
    session: mockSession,
    contacts: mockContacts,
    hubSessions: [],
    currentContact: mockContacts[0],
    focusedContactId: 101,
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
    canPowerDialer: true,
    token: 'valid-token',
    ...props,
  };

  return {
    ...render(
      <DialerProvider token="valid-token" dryRun>
        <SessionWorkspaceV2 {...baseProps} />
      </DialerProvider>,
    ),
    props: baseProps,
  };
}

describe('SessionWorkspaceV2 — Machine Power V2 (Lot L4 #119)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupPool();
    mockFetchDialerConfig.mockResolvedValue({
      env: 'dryrun',
      is_dry_run: false,
      has_caller_id: true,
      has_connection_id: true,
      has_webhook_public_key: true,
      caller_numbers: [
        { e164: '+33184800001', label: 'Ligne Paris', status: 'active', priority: 1 },
        { e164: '+33184800002', label: 'Ligne Lyon', status: 'active', priority: 2 },
      ],
      entitlement: {
        calls_day_limit: 50,
        calls_today: 45,
      },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('1. État OFF : mode désactivé par défaut, bouton Appeler séquentiel visible', () => {
    renderWorkspace();

    // La console Power est en mode OFF
    expect(screen.getByText(/Le mode Power permet la numérotation automatique en parallèle/i)).toBeTruthy();
    const activateBtn = screen.getByRole('button', { name: 'Activer le mode Power' });
    expect(activateBtn).toBeTruthy();

    // Le bouton Appeler séquentiel dans la fiche contact est visible (isCallBarHidden = false)
    const callBtn = screen.getByRole('button', { name: /^Appeler$/i });
    expect(callBtn).toBeTruthy();

    // Le bouton toggle Power est présent dans le header
    expect(screen.getByRole('button', { name: /^Mode Power$/i })).toBeTruthy();
  });

  it('2. État READY : active Power, masque le bouton Appeler séquentiel, affiche CTA Lancer', async () => {
    renderWorkspace();

    // Clic sur "Activer le mode Power"
    const activateBtn = screen.getByRole('button', { name: 'Activer le mode Power' });
    await act(async () => {
      fireEvent.click(activateBtn);
    });

    // L'état Power passe à READY
    expect(screen.getByText(/ready/i)).toBeTruthy();

    // Bouton Appeler séquentiel masqué dès que Power est actif (Livrable 5 & Plan §2)
    expect(screen.queryByRole('button', { name: /^Appeler$/i })).toBeNull();

    // Réglages visibles uniquement en READY : sélecteur de simultanés et de numéro sortant
    expect(screen.getByLabelText(/Appels en parallèle/i)).toBeTruthy();
    expect(screen.getByLabelText(/Numéro sortant/i)).toBeTruthy();

    // Quota contraint (<8 restant : 45/50) affiché
    expect(screen.getByText(/45\/50/)).toBeTruthy();

    // CTA primaire : Lancer min(file prête=2, parallélisme=3) = 2 appels
    const launchBtn = screen.getByRole('button', { name: /Lancer 2 appels/i });
    expect(launchBtn).toBeTruthy();

    // Bouton de désactivation disponible
    expect(screen.getByRole('button', { name: /Désactiver Power/i })).toBeTruthy();
  });

  it('3. État WAVE : verrouille les réglages, CTA Raccrocher tout (panel uniquement, jamais header)', async () => {
    // Simuler une vague en cours avec Power activé
    setupPool(
      { isRunning: true },
      {
        running: true,
        lines: [
          { slot: 0, phase: 'dialing', destination: '+33100000001', error: null },
          { slot: 1, phase: 'ringing', destination: '+33100000002', error: null },
          { slot: 2, phase: 'idle', destination: '', error: null },
        ],
      },
    );

    renderWorkspace({ initialPowerOn: true });

    // En WAVE : statut affiché
    expect(screen.getByText(/wave/i)).toBeTruthy();

    // Réglages verrouillés (non montés dans le DOM en WAVE — Plan §2)
    expect(screen.queryByLabelText(/Appels en parallèle/i)).toBeNull();
    expect(screen.queryByLabelText(/Numéro sortant/i)).toBeNull();

    // Bouton "Passer" disponible sur les lignes dialing/ringing
    const skipBtns = screen.getAllByRole('button', { name: /Passer/i });
    expect(skipBtns.length).toBe(2);
    fireEvent.click(skipBtns[0]);
    expect(poolMockHandlers.skip).toHaveBeenCalledWith(0);

    // CTA primaire WAVE : "Raccrocher tout" DANS LE PANEL UNIQUEMENT
    const hangupAllBtn = screen.getByRole('button', { name: /Raccrocher tout/i });
    expect(hangupAllBtn).toBeTruthy();
    fireEvent.click(hangupAllBtn);
    expect(poolMockHandlers.hangupAll).toHaveBeenCalled();

    // Header : ne contient JAMAIS de bouton "Raccrocher tout" (règle §2 impérative)
    const header = screen.getByRole('banner');
    expect(header.textContent).not.toMatch(/Raccrocher tout/i);
  });

  it('4. État CONVERSATION & ACW : replie la console Power et replie le rail de navigation', () => {
    // Simuler une ligne connectée (conversation) avec Power actif
    setupPool(
      { isRunning: false, winnerContactId: 101 },
      {
        running: false,
        lines: [
          { slot: 0, phase: 'connected', destination: '+33100000001', error: null },
          { slot: 1, phase: 'ended', destination: '+33100000002', error: null },
          { slot: 2, phase: 'idle', destination: '', error: null },
        ],
      },
    );

    renderWorkspace({ initialPowerOn: true });

    // En CONVERSATION : la console Power est repliée (null dans le DOM)
    expect(screen.queryByRole('region', { name: /Console Power/i })).toBeNull();

    // Rail de navigation replié en conversation (isQueueCollapsed réel)
    expect(screen.queryByRole('region', { name: /File d'attente/i })).toBeNull();

    // CTA primaire en fiche contact : "Consigner & suivant"
    expect(screen.getByRole('button', { name: /Consigner & suivant/i })).toBeTruthy();
  });

  it('5. État HANGUP_RETRY : affiche le CTA UNIQUE "Réessayer le raccrochage"', () => {
    setupPool({ hangupRetryable: true });

    renderWorkspace({ initialPowerOn: true });

    // L'état est hangupRetry
    expect(screen.getByText(/hangupRetry/i)).toBeTruthy();

    // CTA UNIQUE dans le panel : Réessayer le raccrochage
    const retryBtn = screen.getByRole('button', { name: /Réessayer le raccrochage/i });
    expect(retryBtn).toBeTruthy();

    // Clic appelle pool.hangupAll
    fireEvent.click(retryBtn);
    expect(poolMockHandlers.hangupAll).toHaveBeenCalled();

    // Pas de doublon dans le header
    const header = screen.getByRole('banner');
    expect(header.textContent).not.toMatch(/Réessayer le raccrochage/i);
  });

  it('6. Sortie transactionnelle I10 : intercepte Quitter pendant une vague et bloque sur échec', () => {
    // Vague en cours
    setupPool(
      { isRunning: true },
      {
        running: true,
        lines: [{ slot: 0, phase: 'dialing', destination: '+33100000001', error: null }],
      },
    );

    const onBack = vi.fn();
    renderWorkspace({ onBack, initialPowerOn: true });

    // Clic sur "Quitter" dans le header
    const quitBtn = screen.getByRole('button', { name: /retour aux séances/i });
    fireEvent.click(quitBtn);

    // Invariant I10 : onBack n'est PAS appelé directement !
    expect(onBack).not.toHaveBeenCalled();
    // Le hangup de sécurité a été déclenché
    expect(poolMockHandlers.hangupAll).toHaveBeenCalled();
  });

  it('7. Sortie transactionnelle I10 : Quitter direct quand Power est au repos (off/ready)', () => {
    // Pool au repos
    setupPool({ isRunning: false });

    const onBack = vi.fn();
    renderWorkspace({ onBack });
    const quitBtn = screen.getByRole('button', { name: /retour aux séances/i });
    fireEvent.click(quitBtn);

    // Hors vague, Quitter sort immédiatement
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('8. Relancer distinct de Quitter : après une vague terminée, affiche Relancer', async () => {
    // Vague terminée avec échecs/skips (hasAttempted = true)
    setupPool(
      { isRunning: false },
      {
        running: false,
        lines: [
          { slot: 0, phase: 'skipped', destination: '+33100000001', error: null },
          { slot: 1, phase: 'ended', destination: '+33100000002', error: null },
          { slot: 2, phase: 'idle', destination: '', error: null },
        ],
      },
    );

    renderWorkspace({ initialPowerOn: true });

    // En READY avec tentative passée, le CTA primaire est "Relancer"
    const relaunchBtn = screen.getByRole('button', { name: /Relancer/i });
    expect(relaunchBtn).toBeTruthy();

    await act(async () => {
      fireEvent.click(relaunchBtn);
    });

    expect(poolMockHandlers.redial).toHaveBeenCalled();

    // Le bouton Quitter reste indépendant dans le header
    const quitBtn = screen.getByRole('button', { name: /retour aux séances/i });
    expect(quitBtn).toBeTruthy();
  });

  it('9. Sortie transactionnelle I10 : B2a course lignes terminales, B2b échec bloque, 200 idle libère', async () => {
    // B2a — pendant la vague, les lignes sont terminales (skipped) mais running retombe à false
    // AVANT que le serveur ne confirme le 200 : la sortie ne doit PAS partir (signature idle exigée).
    setupPool(
      { isRunning: false },
      {
        running: false,
        lines: [
          { slot: 0, phase: 'skipped', destination: '+331****0001', error: null },
          { slot: 1, phase: 'skipped', destination: '+331****0002', error: null },
          { slot: 2, phase: 'ended', destination: '+331****0003', error: null },
        ],
      },
    );

    const onBack = vi.fn();
    const { rerender } = renderWorkspace({ onBack, initialPowerOn: true });

    // Clic sur Quitter : le pool est "au repos" (running false) mais les lignes ne sont
    // PAS idle -> la sortie reste bloquée (le hangup serveur est encore en vol)
    const quitBtn = screen.getByRole('button', { name: /retour aux séances/i });
    fireEvent.click(quitBtn);
    expect(poolMockHandlers.hangupAll).toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();

    // B2b — échec serveur confirmé (hangupRetryable) : la sortie reste bloquée, CTA retry unique
    setupPool(
      { isRunning: false, hangupRetryable: true },
      {
        running: false,
        lines: [{ slot: 0, phase: 'failed', destination: '+331****0001', error: 'Raccrochage serveur impossible' }],
      },
    );
    rerender(<App onBack={onBack} />);
    expect(onBack).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Réessayer le raccrochage/i })).toBeTruthy();

    // 200 — on re-clique Quitter (le retry a résolu), les lignes passent à idle : la sortie part
    setupPool(
      { isRunning: false, hangupRetryable: false },
      {
        running: false,
        lines: [{ slot: 0, phase: 'idle', destination: '', error: null }],
      },
    );
    rerender(<App onBack={onBack} />);
    const quitBtn2 = screen.getByRole('button', { name: /retour aux séances/i });
    fireEvent.click(quitBtn2);
    // Le pool est au repos + lignes idle : signature du 200 réelle
    expect(onBack).toHaveBeenCalledTimes(1);
  });
  it('10. Quota règles : masqué si remaining >= 8, bloqué si remaining === 0 (bouton Lancer disabled)', async () => {
    // Quota bloqué : 50/50
    mockFetchDialerConfig.mockResolvedValue({
      env: 'dryrun',
      is_dry_run: false,
      has_caller_id: true,
      has_connection_id: true,
      has_webhook_public_key: true,
      caller_numbers: [{ e164: '+33184800001', label: 'Ligne Paris', status: 'active', priority: 1 }],
      entitlement: {
        calls_day_limit: 50,
        calls_today: 50,
      },
    });

    renderWorkspace({ initialPowerOn: true });
    // Quota bloqué affiché avec style dédié après chargement config
    await waitFor(() => {
      expect(screen.getByText(/50\/50/)).toBeTruthy();
    });
    const blockedLaunchBtn = screen.getByRole('button', { name: /Lancer/i });
    expect(blockedLaunchBtn.getAttribute('disabled')).not.toBeNull();
  });

  it('11. Invariant I9 & Règle 8 : file unique E.164 dédupliquée et zéro assert au render', () => {
    const dirtyContacts: SessionContact[] = [
      { ...mockContacts[0], phone: '+331****0001' }, // contact 101
      { ...mockContacts[1], phone: '+331****0001' }, // doublon exact (102)
      { ...mockContacts[0], id: 103, phone: 'invalid-phone' }, // non E.164, rejeté
    ];

    renderWorkspace({ contacts: dirtyContacts, initialPowerOn: true });

    // Le pool reçoit la destination unique dédupliquée, avec le SEUL premier id associé
    // (la projection garde un id par destination — comportement I9)
    // +331****0001 → normalizeE164 retire les * → +3310001 (prouvé par charCodes)
    expect(poolMockHandlers.setQueue).toHaveBeenCalledWith(
      ['+3310001'],
      [101],
    );
    // Le contact non E.164 est compté comme injoignable, pas envoyé
    expect(poolMockHandlers.setQueue).not.toHaveBeenCalledWith(
      expect.arrayContaining(['invalid-phone']),
      expect.anything(),
    );
  });
  });

  function App({ onBack }: { onBack: () => void }) {
    return (
      <DialerProvider token="valid-token" dryRun>
        <SessionWorkspaceV2
          session={mockSession}
          contacts={mockContacts}
          hubSessions={[]}
          currentContact={mockContacts[0]}
          focusedContactId={101}
          loading={false}
          error={null}
          awaitingEvent={null}
          contactContext={null}
          contextContactId={null}
          onBack={onBack}
          onFocusContact={vi.fn()}
          onLogAndNext={vi.fn()}
          onLogRdvAndNext={vi.fn()}
          onLogMany={vi.fn()}
          onLogEvent={vi.fn()}
          onDeferContacts={vi.fn()}
          onRemoveContacts={vi.fn()}
          onUpdateRecall={vi.fn()}
          canPowerDialer={true}
          token="valid-token"
          initialPowerOn={true}
        />
      </DialerProvider>
    );
  }
