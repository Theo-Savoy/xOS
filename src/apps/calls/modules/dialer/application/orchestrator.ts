/**
 * modules/dialer/application/orchestrator.ts — stub.
 *
 * Phase 11.2 will implement: parallel N-line orchestration,
 * abandonment ratios, retry policy. Pure (no React, no fetch).
 */

import type { CallLine, DialerEvent } from '../domain/CallState';

export interface DialerOrchestrator {
  readonly lines: ReadonlyArray<CallLine>;
  dial(contactId: string, phone: string): void;
  hangup(lineId: string): void;
  onEvent(handler: (event: DialerEvent) => void): () => void;
}

export function createOrchestrator(): DialerOrchestrator {
  // TODO(Phase 11.2): implement multi-line orchestration.
  const noop = () => {};
  return {
    lines: [],
    dial: noop,
    hangup: noop,
    onEvent: () => noop,
  };
}