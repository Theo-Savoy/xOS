/**
 * modules/dialer/index.ts — barrel.
 *
 * Phase 11.2 will export: createOrchestrator, useTelnyxDialer hook,
 * PowerDialerView, ACWOverlay, types.
 */

export { createOrchestrator } from './application/orchestrator';
export type { DialerOrchestrator } from './application/orchestrator';
export type { CallLine, CallPhase, CallLineId, DialerEvent } from './domain/CallState';