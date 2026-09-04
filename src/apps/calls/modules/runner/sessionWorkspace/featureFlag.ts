import { useRef } from 'react';
import type { RunnerVersion } from './types';

/** Clé de stockage locale pour le feature flag du nouveau runner V2 */
export const RUNNER_V2_STORAGE_KEY = 'xos-combo-runner-v2';

/**
 * CRITÈRES DE PROMOTION ET DE ROLLBACK (Plan §5.6 - Issue #119)
 *
 * --- Critères de promotion (legacy -> V2 par défaut) ---
 * 1. Parité fonctionnelle complète : les 6 résultats d'appels, qualification,
 *    rappels rapides/date, NPA, RDV (transaction appel+Event), report, retrait,
 *    bulk et clôture de session fonctionnent sans régression.
 * 2. Invariants métier vérifiés : I1 à I15 tous validés par tests automatisés.
 * 3. Mode Power opérationnel : transitions off/ready/wave/conversation/acw/hangupRetry
 *    sans désynchronisation, déduplication stricte des numéros, raccrochage fiable.
 * 4. Responsive & a11y : affichage correct à 320px, 720px, 900px, aucun scroll parasite,
 *    zéro violation axe critique/sérieuse.
 * 5. Taux d'erreur log optimiste / réseau inférieur ou égal au legacy.
 *
 * --- Critères de rollback (V2 -> legacy) ---
 * 1. Perte ou désynchronisation de consignation d'appel (ACW).
 * 2. Blocage ou fuite d'état du pool Power (lignes pendantes, échec de raccrochage non retryable).
 * 3. Double écouteur clavier provoquant des actions fantômes.
 * 4. Régression critique sur la création d'Event Salesforce lors d'un RDV.
 *
 * RÈGLE DE SÉCURITÉ RUNTIME :
 * Le rollback vers le legacy n'est autorisé qu'avant le lancement d'une vague ou après
 * un raccrochage confirmé (200). Aucun basculement dynamique n'est permis pendant une vague.
 */

/**
 * Lit l'état du flag runner V2 depuis les paramètres d'URL ou le stockage local.
 * Priorité :
 * 1. Paramètre d'URL `?runner=v2` (force V2) ou `?runner=legacy` (force legacy)
 * 2. Valeur dans localStorage ('1' = actif, '0' = inactif)
 * 3. Défaut = false (legacy actif par défaut pour déploiement progressif sécurisé)
 */
export function readRunnerV2Flag(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const params = new URLSearchParams(window.location.search);
    const paramVal = params.get('runner');
    if (paramVal === 'v2') return true;
    if (paramVal === 'legacy') return false;
  } catch {
    /* ignore search parsing issues */
  }

  try {
    return window.localStorage?.getItem(RUNNER_V2_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Persiste le choix du feature flag dans le stockage local.
 */
export function writeRunnerV2Flag(enabled: boolean): void {
  try {
    if (enabled) {
      window.localStorage?.setItem(RUNNER_V2_STORAGE_KEY, '1');
    } else {
      window.localStorage?.removeItem(RUNNER_V2_STORAGE_KEY);
    }
  } catch {
    /* ignore storage write errors */
  }
}

/**
 * Hook garantissant qu'une version du runner est figée à l'ouverture de la séance.
 * Empêche tout basculement dynamique pendant une séance ou une vague active.
 *
 * @param sessionId ID de la séance active
 * @param explicitOverride Surcharge explicite optionnelle (ex: tests)
 */
export function useSessionRunnerVersion(
  sessionId: number,
  explicitOverride?: RunnerVersion,
): RunnerVersion {
  const currentSessionIdRef = useRef<number | null>(null);
  const frozenVersionRef = useRef<RunnerVersion>('legacy');

  if (explicitOverride) {
    return explicitOverride;
  }

  // Si on change de session ou au tout premier rendu, on fige le choix
  if (currentSessionIdRef.current !== sessionId) {
    currentSessionIdRef.current = sessionId;
    frozenVersionRef.current = readRunnerV2Flag() ? 'v2' : 'legacy';
  }

  return frozenVersionRef.current;
}
