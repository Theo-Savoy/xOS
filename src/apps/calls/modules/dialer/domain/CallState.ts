/**
 * domain/CallState.ts — phases d'un appel mono-ligne.
 *
 * Vocabulaire produit, indépendant du SDK : le mapping SDK → phase vit dans
 * `infrastructure/telnyx/rtcClient.ts` (telnyxPhase). Le pool a sa propre
 * phase (PoolState.ts) — le socle commun LinePhase est défini ici.
 */

/** Phases communes à toute ligne d'appel (mono-ligne et pool). */
export type LinePhase = 'idle' | 'dialing' | 'ringing' | 'connected' | 'ended' | 'failed';

/** Mono-ligne : + mise en attente et clôture (ACW, jamais d'auto-next — ARCEP). */
export type CallPhase = LinePhase | 'on_hold' | 'wrapping';
