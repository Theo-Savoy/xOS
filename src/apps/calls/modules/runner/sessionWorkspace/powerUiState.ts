import type { SessionContact } from '../../types';
import type {
  PowerPrimaryCta,
  PowerStateInputs,
  PowerUiState,
  PowerViewModel,
  ProjectedPowerQueue,
} from './types';

/** Le serveur refuse tout le lot si un seul numéro n'est pas E.164 (pool.js). */
const E164_REGEX = /^\+[1-9]\d{6,14}$/;

/**
 * Normalise un numéro de fiche en E.164 avant envoi au pool.
 * - retire tout sauf chiffres et `+` (espaces, tirets, parenthèses, points)
 * - `+33 (0)6…` → `+336…` (notation française, le (0) ne se compose pas)
 * - `00…` → `+…` (préfixe international)
 * - `0X XX XX XX XX` / `06…` (national FR) → `+33X…`
 * Retourne `null` si le numéro est absent, vide ou non conforme E.164.
 */
export function normalizeE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const compact = raw.replace(/[^\d+]/g, '');
  if (!compact) return null;
  let candidate = compact;
  if (candidate.startsWith('+330')) candidate = `+33${candidate.slice(4)}`;
  else if (candidate.startsWith('00')) candidate = `+${candidate.slice(2)}`;
  else if (candidate.startsWith('0') && candidate.length === 10) {
    candidate = `+33${candidate.slice(1)}`;
  }
  return E164_REGEX.test(candidate) ? candidate : null;
}

/**
 * Source unique de vérité pour la projection et la déduplication de la file Power.
 * Remplace la divergence historique entre RunnerView (compte brut) et PowerStrip (déduplication).
 * Invariant I9 : Résumé de file = destinations réellement envoyées au pool.
 */
export function projectPowerQueue(
  contacts: SessionContact[],
  currentUserId: string | null = null,
): ProjectedPowerQueue {
  const known = new Map<string, SessionContact>();
  const destinations: string[] = [];
  const ids: number[] = [];
  let unreachable = 0;
  let duplicates = 0;
  let totalEligible = 0;

  for (const contact of contacts) {
    if (contact.status !== 'pending') continue;
    if (
      contact.claim_active &&
      contact.claimed_by &&
      currentUserId &&
      contact.claimed_by !== currentUserId
    ) {
      continue;
    }
    totalEligible += 1;
    const phone = normalizeE164(contact.phone);
    if (!phone) {
      unreachable += 1;
      continue;
    }
    if (known.has(phone)) {
      duplicates += 1;
      continue;
    }
    known.set(phone, contact);
    destinations.push(phone);
    ids.push(contact.id);
  }

  return {
    queue: destinations,
    contactIds: ids,
    byPhone: known,
    readyCount: destinations.length,
    unreachableCount: unreachable,
    totalEligiblePendingCount: totalEligible,
    duplicateCount: duplicates,
  };
}

/**
 * Dérive l'état discriminé pur du mode Power à partir des booléens opérationnels.
 * Ne modifie aucun composant sous-jacent (useDialerPool, pool.js).
 * Ordre de précédence :
 * 1. Power désactivé ou indisponible -> 'off'
 * 2. Échec de raccrochage nécessitant retry -> 'hangupRetry'
 * 3. Ligne active connectée -> 'conversation'
 * 4. Phase de consignation post-appel -> 'acw'
 * 5. Pool en cours de composition / sonnerie -> 'wave'
 * 6. Au repos -> 'ready'
 */
export function derivePowerUiState(inputs: PowerStateInputs): PowerUiState {
  if (inputs.powerAvailable === false || !inputs.powerOn) {
    return 'off';
  }
  if (inputs.hangupRetryable) {
    return 'hangupRetry';
  }
  if (inputs.hasConnectedLine) {
    return 'conversation';
  }
  if (inputs.isAcw) {
    return 'acw';
  }
  if (inputs.isRunning) {
    return 'wave';
  }
  return 'ready';
}

export interface PowerCtaOptions {
  readyCount?: number;
  hasPriorWave?: boolean;
}

/**
 * Détermine le CTA primaire associé à un état Power Ui.
 * Respecte les règles d'arbitrage (D4, D5) :
 * - off : Appeler séquentiel (header / contact)
 * - ready : Lancer N ou Relancer (panel)
 * - wave : Raccrocher tout (panel uniquement, jamais header)
 * - conversation : Consigner & suivant (ACW prioritaire, raccrochage en secondaire danger)
 * - acw : Consigner & suivant
 * - hangupRetry : Réessayer le raccrochage (CTA unique, aucun bouton dupliqué)
 */
export function getPowerPrimaryCta(
  state: PowerUiState,
  options?: PowerCtaOptions,
): PowerPrimaryCta {
  switch (state) {
    case 'off':
      return {
        id: 'call-sequential',
        label: 'Appeler',
        variant: 'primary',
        location: 'header',
      };
    case 'ready':
      if (options?.hasPriorWave) {
        return {
          id: 'relaunch-wave',
          label: 'Relancer',
          variant: 'primary',
          location: 'panel',
        };
      }
      return {
        id: 'launch-wave',
        label:
          options?.readyCount != null && options.readyCount > 0
            ? `Lancer (${options.readyCount})`
            : 'Lancer',
        variant: 'primary',
        location: 'panel',
      };
    case 'wave':
      return {
        id: 'hangup-all',
        label: 'Raccrocher tout',
        variant: 'danger',
        location: 'panel',
      };
    case 'conversation':
    case 'acw':
      return {
        id: 'log-and-next',
        label: 'Consigner & suivant',
        variant: 'primary',
        location: 'contact-acw',
      };
    case 'hangupRetry':
      return {
        id: 'retry-hangup',
        label: 'Réessayer le raccrochage',
        variant: 'danger',
        location: 'panel',
      };
  }
}

/**
 * Projette la vue modèle complète PowerUiState et ses invariants UI dérivés.
 */
export function derivePowerViewModel(
  inputs: PowerStateInputs,
  options?: PowerCtaOptions,
): PowerViewModel {
  const state = derivePowerUiState(inputs);
  const primaryCta = getPowerPrimaryCta(state, options);
  const isPowerActive = state !== 'off';

  return {
    state,
    primaryCta,
    isPowerActive,
    // Réglages verrouillés sauf au repos en ready
    isSettingsLocked: state !== 'ready',
    // Masquage de l'appel séquentiel et de la CallBar dès que Power est actif
    isCallBarHidden: isPowerActive,
    canRelaunch: state === 'ready',
    canHangupAll: state === 'wave',
    canRetryHangup: state === 'hangupRetry',
    // En conversation, repli automatique du rail de file pour priorité à la fiche (D6)
    isQueueCollapsed: state === 'conversation',
  };
}

/**
 * Graphe des transitions d'états Power autorisées selon le contrat #119.
 */
export const ALLOWED_POWER_TRANSITIONS: Record<
  PowerUiState,
  readonly PowerUiState[]
> = {
  off: ['off', 'ready'],
  ready: ['ready', 'wave', 'off'],
  wave: ['wave', 'conversation', 'ready', 'hangupRetry'],
  conversation: ['conversation', 'acw', 'ready', 'hangupRetry', 'off'],
  acw: ['acw', 'ready', 'wave', 'off'],
  hangupRetry: ['hangupRetry', 'ready', 'off'],
};

/**
 * Vérifie si une transition entre deux états PowerUiState est valide.
 */
export function isValidPowerUiTransition(
  from: PowerUiState,
  to: PowerUiState,
): boolean {
  const allowed = ALLOWED_POWER_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

/**
 * Asserte la validité d'une transition et lève une erreur explicite sinon.
 */
export function assertValidPowerUiTransition(
  from: PowerUiState,
  to: PowerUiState,
): void {
  if (!isValidPowerUiTransition(from, to)) {
    throw new Error(
      `[PowerUiState] Transition invalide de '${from}' vers '${to}'`,
    );
  }
}
