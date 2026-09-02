// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionContact } from '../../types';
import { PowerStrip } from './PowerStrip';

const { mockUseDialerPool, mockFetchDialerConfig, mockPlayComboSound } = vi.hoisted(() => ({
  mockUseDialerPool: vi.fn(),
  mockFetchDialerConfig: vi.fn(),
  mockPlayComboSound: vi.fn(),
}));
vi.mock('../gamification/comboSounds', () => ({ playComboSound: mockPlayComboSound }));
vi.mock('../gamification/comboKeyboard', () => ({ readSoundsEnabled: () => true }));
vi.mock('../dialer/application/useDialerPool', () => ({ useDialerPool: mockUseDialerPool }));
vi.mock('../dialer/dialerApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../dialer/dialerApi')>()),
  fetchDialerConfig: mockFetchDialerConfig,
}));

const setQueue = vi.fn();
let winnerContactId: number | null = null;
let poolOptions: Record<string, unknown> = {};

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

function config(over: Partial<{ calls_day_limit: number; calls_today: number }> = {}) {
  return {
    env: 'dryrun', is_dry_run: false, has_caller_id: true, has_connection_id: true,
    has_webhook_public_key: true,
    caller_numbers: [
      { e164: '+33184800001', label: 'Ligne Paris', status: 'active', priority: 0 },
      { e164: '+33478900002', label: null, status: 'active', priority: 1 },
    ],
    entitlement: {
      enabled: true, dry_run: false,
      calls_day_limit: over.calls_day_limit ?? 50,
      calls_today: over.calls_today ?? 12,
    },
    flags: {
      enabled: true, dry_run: false, budget_session_cents: 300,
      budget_user_day_cents: 1000, budget_org_month_cents: 15000,
      rate_rps: 5, rate_burst: 20,
    },
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
  poolOptions = {};
  mockFetchDialerConfig.mockResolvedValue(config());
  mockUseDialerPool.mockImplementation((options: Record<string, unknown>) => {
    poolOptions = options;
    return poolStub();
  });
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
    expect(setQueue).toHaveBeenLastCalledWith(['+33100000001', '+33100000007'], [1, 7]);
  });

  it('annonce les contacts sans numéro composable', () => {
    renderStrip([
      contact({ id: 1, phone: '+33100000001' }),
      contact({ id: 2, phone: '01 00 00 00 02' }),
      contact({ id: 3, phone: null }),
    ]);
    expect(screen.getByText(/2 sans numéro composable/)).toBeTruthy();
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

describe('PowerStrip — lancement', () => {
  it('joue le son de lancement et pousse l’animation sur l’encart', () => {
    const play = vi.fn();
    mockUseDialerPool.mockImplementation(() => ({ ...poolStub(), play }));
    const { container } = render(
      <PowerStrip
        token="tok" sessionId={7} contacts={[contact({ id: 1, phone: '+33100000001' })]}
        currentUserId="me" onFocusContact={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Lancer 3 appels/ }));
    expect(mockPlayComboSound).toHaveBeenCalledWith('power-launch', { master: true });
    expect(play).toHaveBeenCalled();
    expect(container.querySelector('.calls-power-strip--launching')).toBeTruthy();
  });
});

describe('PowerStrip — numéro sortant et quota', () => {
  it('propose les numéros du compte et transmet celui choisi au pool', async () => {
    renderStrip([contact({ id: 1, phone: '+33100000001' })]);
    const trigger = await screen.findByRole('button', { name: 'Numéro sortant' });
    // Défaut : premier numéro alloué, affiché par son libellé métier.
    await waitFor(() => expect(poolOptions.callerNumber).toBe('+33184800001'));
    expect(trigger.textContent).toContain('Ligne Paris');

    // Le second numéro n'a pas de libellé : il s'affiche formaté.
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('option', { name: '+33 4 78 90 00 02' }));
    await waitFor(() => expect(poolOptions.callerNumber).toBe('+33478900002'));
  });

  it('formate les numéros en clair dans la liste déroulante', async () => {
    renderStrip([contact({ id: 1, phone: '+33100000001' })]);
    fireEvent.click(await screen.findByRole('button', { name: 'Numéro sortant' }));
    expect(screen.getByRole('option', { name: 'Ligne Paris · +33 1 84 80 00 01' })).toBeTruthy();
  });

  it('retire les réglages pendant un cycle pour ne garder que l’essentiel', async () => {
    mockUseDialerPool.mockImplementation(() => ({ ...poolStub(), isRunning: true }));
    renderStrip([contact({ id: 1, phone: '+33100000001' })]);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Raccrocher tout' })).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Numéro sortant' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Appels en parallèle' })).toBeNull();
  });

  it('affiche la consommation du quota du jour', async () => {
    renderStrip([contact({ id: 1, phone: '+33100000001' })]);
    expect(await screen.findByText('12/50')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Lancer 3 appels/ }).hasAttribute('disabled')).toBe(false);
  });

  it('bloque le lancement quand la limite du jour est atteinte', async () => {
    mockFetchDialerConfig.mockResolvedValue(config({ calls_today: 50 }));
    renderStrip([contact({ id: 1, phone: '+33100000001' })]);
    await screen.findByText('50/50');
    const play = screen.getByRole('button', { name: /Lancer 3 appels/ });
    expect(play.hasAttribute('disabled')).toBe(true);
    expect(play.getAttribute('title')).toBe('Limite d’appels du jour atteinte');
  });

  it('masque le sélecteur si le compte n’a aucun numéro alloué', async () => {
    mockFetchDialerConfig.mockResolvedValue({ ...config(), caller_numbers: [] });
    renderStrip([contact({ id: 1, phone: '+33100000001' })]);
    await screen.findByText('12/50');
    expect(screen.queryByRole('button', { name: 'Numéro sortant' })).toBeNull();
  });
});
