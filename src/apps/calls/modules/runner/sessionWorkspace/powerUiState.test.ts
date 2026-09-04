import { describe, expect, it } from 'vitest';
import type { SessionContact } from '../../types';
import {
  ALLOWED_POWER_TRANSITIONS,
  assertValidPowerUiTransition,
  derivePowerUiState,
  derivePowerViewModel,
  getPowerPrimaryCta,
  isValidPowerUiTransition,
  normalizeE164,
  projectPowerQueue,
} from './powerUiState';
import type { PowerUiState } from './types';

function createMockContact(
  partial: Partial<SessionContact> & { id: number },
): SessionContact {
  return {
    account_name: 'Acme Corp',
    call_session_id: 1,
    called_at: null,
    called_count: 0,
    claim_active: false,
    claim_expires_at: null,
    claimed_at: null,
    claimed_by: null,
    contact_name: `Contact ${partial.id}`,
    id: partial.id,
    job_title: 'Directeur',
    phone: '06 12 34 56 78',
    qualification_status: null,
    recall_at: null,
    session_index: partial.id,
    status: 'pending',
    ...partial,
  };
}

describe('powerUiState - normalizeE164', () => {
  it('normalise les numéros français et internationaux standard', () => {
    expect(normalizeE164('06 12 34 56 78')).toBe('+33612345678');
    expect(normalizeE164('01.23.45.67.89')).toBe('+33123456789');
    expect(normalizeE164('+33 (0)6 12 34 56 78')).toBe('+33612345678');
    expect(normalizeE164('0033612345678')).toBe('+33612345678');
    expect(normalizeE164('+32 2 123 45 67')).toBe('+3221234567');
  });

  it('rejette les numéros non composables ou invalides', () => {
    expect(normalizeE164(null)).toBeNull();
    expect(normalizeE164(undefined)).toBeNull();
    expect(normalizeE164('')).toBeNull();
    expect(normalizeE164('abc')).toBeNull();
    expect(normalizeE164('123')).toBeNull();
  });
});

describe('powerUiState - projectPowerQueue (Invariant I9)', () => {
  it('projette uniquement les contacts pending éligibles et déduplique les numéros identiques', () => {
    const contacts: SessionContact[] = [
      createMockContact({ id: 1, phone: '06 11 11 11 11', status: 'pending' }),
      // Contact 2 partage le même numéro que contact 1 -> doublon écarté
      createMockContact({ id: 2, phone: '06 11 11 11 11', status: 'pending' }),
      createMockContact({ id: 3, phone: '06 22 22 22 22', status: 'pending' }),
      // Contact 4 déjà appelé -> ignoré
      createMockContact({ id: 4, phone: '06 33 33 33 33', status: 'called' }),
      // Contact 5 sans téléphone valide -> injoignable
      createMockContact({ id: 5, phone: 'invalid', status: 'pending' }),
    ];

    const result = projectPowerQueue(contacts, 'user-1');

    expect(result.queue).toEqual(['+33611111111', '+33622222222']);
    expect(result.contactIds).toEqual([1, 3]);
    expect(result.readyCount).toBe(2);
    expect(result.unreachableCount).toBe(1);
    expect(result.duplicateCount).toBe(1);
    expect(result.totalEligiblePendingCount).toBe(4);
    // Invariant I9 : readyCount correspond exactement au nombre de destinations envoyées au pool
    expect(result.readyCount).toBe(result.queue.length);
    expect(result.byPhone.get('+33611111111')?.id).toBe(1);
  });

  it('respecte les claims actifs d’autres agents', () => {
    const contacts: SessionContact[] = [
      createMockContact({
        id: 1,
        phone: '06 11 11 11 11',
        status: 'pending',
        claim_active: true,
        claimed_by: 'other-user',
      }),
      createMockContact({
        id: 2,
        phone: '06 22 22 22 22',
        status: 'pending',
        claim_active: true,
        claimed_by: 'current-user',
      }),
      createMockContact({
        id: 3,
        phone: '06 33 33 33 33',
        status: 'pending',
        claim_active: false,
      }),
    ];

    const result = projectPowerQueue(contacts, 'current-user');

    expect(result.queue).toEqual(['+33622222222', '+33633333333']);
    expect(result.contactIds).toEqual([2, 3]);
    expect(result.readyCount).toBe(2);
    expect(result.totalEligiblePendingCount).toBe(2);
  });
});

describe('powerUiState - derivePowerUiState', () => {
  it('retourne off si le mode est éteint ou indisponible', () => {
    expect(derivePowerUiState({ powerOn: false })).toBe('off');
    expect(derivePowerUiState({ powerOn: true, powerAvailable: false })).toBe(
      'off',
    );
  });

  it('retourne hangupRetry avec la priorité maximale en cas d’échec de raccrochage', () => {
    expect(
      derivePowerUiState({
        powerOn: true,
        hangupRetryable: true,
        hasConnectedLine: true,
        isRunning: true,
      }),
    ).toBe('hangupRetry');
  });

  it('retourne conversation dès qu’une ligne est connectée', () => {
    expect(
      derivePowerUiState({
        powerOn: true,
        hasConnectedLine: true,
        isRunning: true,
      }),
    ).toBe('conversation');
  });

  it('retourne acw quand l’agent consigne après l’appel', () => {
    expect(
      derivePowerUiState({
        powerOn: true,
        isAcw: true,
        isRunning: false,
      }),
    ).toBe('acw');
  });

  it('retourne wave si le pool tourne sans ligne encore connectée', () => {
    expect(
      derivePowerUiState({
        powerOn: true,
        isRunning: true,
        hasConnectedLine: false,
      }),
    ).toBe('wave');
  });

  it('retourne ready au repos avec powerOn=true', () => {
    expect(
      derivePowerUiState({
        powerOn: true,
        isRunning: false,
        hasConnectedLine: false,
      }),
    ).toBe('ready');
  });
});

describe('powerUiState - getPowerPrimaryCta & derivePowerViewModel', () => {
  it('fournit le bon CTA primaire et les invariants UI pour chaque état', () => {
    // 1. OFF
    const offVm = derivePowerViewModel({ powerOn: false });
    expect(offVm.state).toBe('off');
    expect(offVm.primaryCta).toEqual({
      id: 'call-sequential',
      label: 'Appeler',
      variant: 'primary',
      location: 'header',
    });
    expect(offVm.isPowerActive).toBe(false);
    expect(offVm.isSettingsLocked).toBe(true);
    expect(offVm.isCallBarHidden).toBe(false);
    expect(offVm.isQueueCollapsed).toBe(false);

    // 2. READY (nouveau lancement)
    const readyVm = derivePowerViewModel(
      { powerOn: true },
      { readyCount: 5, hasPriorWave: false },
    );
    expect(readyVm.state).toBe('ready');
    expect(readyVm.primaryCta).toEqual({
      id: 'launch-wave',
      label: 'Lancer (5)',
      variant: 'primary',
      location: 'panel',
    });
    expect(readyVm.isPowerActive).toBe(true);
    expect(readyVm.isSettingsLocked).toBe(false); // Réglages déverrouillés en ready
    expect(readyVm.isCallBarHidden).toBe(true);
    expect(readyVm.canRelaunch).toBe(true);
    expect(readyVm.isQueueCollapsed).toBe(false);

    // 2b. READY (relance après vague)
    const readyRelaunchCta = getPowerPrimaryCta('ready', {
      hasPriorWave: true,
    });
    expect(readyRelaunchCta).toEqual({
      id: 'relaunch-wave',
      label: 'Relancer',
      variant: 'primary',
      location: 'panel',
    });

    // 3. WAVE
    const waveVm = derivePowerViewModel({ powerOn: true, isRunning: true });
    expect(waveVm.state).toBe('wave');
    expect(waveVm.primaryCta).toEqual({
      id: 'hangup-all',
      label: 'Raccrocher tout',
      variant: 'danger',
      location: 'panel', // Raccrocher tout dans le panel uniquement, jamais header
    });
    expect(waveVm.isSettingsLocked).toBe(true);
    expect(waveVm.canHangupAll).toBe(true);

    // 4. CONVERSATION
    const convVm = derivePowerViewModel({
      powerOn: true,
      hasConnectedLine: true,
    });
    expect(convVm.state).toBe('conversation');
    expect(convVm.primaryCta).toEqual({
      id: 'log-and-next',
      label: 'Consigner & suivant',
      variant: 'primary',
      location: 'contact-acw',
    });
    expect(convVm.isQueueCollapsed).toBe(true); // Rail replié en conversation (D6)

    // 5. ACW
    const acwVm = derivePowerViewModel({ powerOn: true, isAcw: true });
    expect(acwVm.state).toBe('acw');
    expect(acwVm.primaryCta).toEqual({
      id: 'log-and-next',
      label: 'Consigner & suivant',
      variant: 'primary',
      location: 'contact-acw',
    });
    expect(acwVm.isQueueCollapsed).toBe(false);

    // 6. HANGUP RETRY
    const retryVm = derivePowerViewModel({
      powerOn: true,
      hangupRetryable: true,
    });
    expect(retryVm.state).toBe('hangupRetry');
    expect(retryVm.primaryCta).toEqual({
      id: 'retry-hangup',
      label: 'Réessayer le raccrochage',
      variant: 'danger',
      location: 'panel',
    });
    expect(retryVm.canRetryHangup).toBe(true);
  });
});

describe('powerUiState - Transitions d’états (Plan §2)', () => {
  const allStates: PowerUiState[] = [
    'off',
    'ready',
    'wave',
    'conversation',
    'acw',
    'hangupRetry',
  ];

  it('valide les transitions prévues par le contrat', () => {
    // off -> ready
    expect(isValidPowerUiTransition('off', 'ready')).toBe(true);

    // ready -> wave (Lancer)
    expect(isValidPowerUiTransition('ready', 'wave')).toBe(true);
    // ready -> off (Extinction Power)
    expect(isValidPowerUiTransition('ready', 'off')).toBe(true);

    // wave -> conversation (>=1 connected)
    expect(isValidPowerUiTransition('wave', 'conversation')).toBe(true);
    // wave -> ready (vague terminée sans connecté)
    expect(isValidPowerUiTransition('wave', 'ready')).toBe(true);
    // wave -> hangupRetry (échec raccrochage)
    expect(isValidPowerUiTransition('wave', 'hangupRetry')).toBe(true);

    // conversation -> acw (décrochage terminé)
    expect(isValidPowerUiTransition('conversation', 'acw')).toBe(true);
    // conversation -> ready (consigné directement)
    expect(isValidPowerUiTransition('conversation', 'ready')).toBe(true);
    // conversation -> hangupRetry (échec raccrochage)
    expect(isValidPowerUiTransition('conversation', 'hangupRetry')).toBe(true);
    // conversation -> off (sortie session)
    expect(isValidPowerUiTransition('conversation', 'off')).toBe(true);

    // acw -> ready (Relancer / fin de consignation)
    expect(isValidPowerUiTransition('acw', 'ready')).toBe(true);
    // acw -> wave (relance immédiate)
    expect(isValidPowerUiTransition('acw', 'wave')).toBe(true);
    // acw -> off (sortie)
    expect(isValidPowerUiTransition('acw', 'off')).toBe(true);

    // hangupRetry -> ready (succès retry 200)
    expect(isValidPowerUiTransition('hangupRetry', 'ready')).toBe(true);
    // hangupRetry -> off (sortie confirmée 200)
    expect(isValidPowerUiTransition('hangupRetry', 'off')).toBe(true);
  });

  it('interdit les transitions non contractuelles', () => {
    // Pas de saut direct de off vers wave sans passer par ready
    expect(isValidPowerUiTransition('off', 'wave')).toBe(false);
    expect(isValidPowerUiTransition('off', 'conversation')).toBe(false);
    // Pas de saut de ready vers conversation sans wave
    expect(isValidPowerUiTransition('ready', 'conversation')).toBe(false);
    // Pas de relance directe depuis hangupRetry sans résolution 200
    expect(isValidPowerUiTransition('hangupRetry', 'wave')).toBe(false);
    expect(isValidPowerUiTransition('hangupRetry', 'conversation')).toBe(false);

    expect(() => assertValidPowerUiTransition('off', 'wave')).toThrow(
      "[PowerUiState] Transition invalide de 'off' vers 'wave'",
    );
  });

  it('autorise les auto-transitions pour tous les états', () => {
    for (const state of allStates) {
      expect(isValidPowerUiTransition(state, state)).toBe(true);
    }
  });

  it('respecte exhaustivement la matrice ALLOWED_POWER_TRANSITIONS', () => {
    for (const from of allStates) {
      const allowed = ALLOWED_POWER_TRANSITIONS[from];
      expect(allowed).toBeDefined();
      expect(allowed.length).toBeGreaterThan(0);
    }
  });
});
