/**
 * modules/dialer/ — Telephony-agnostic dialer module.
 *
 * Telnyx (Phase 11) is an adapter inside `infrastructure/telnyx/`.
 * Call state, line concurrency, retries, recording, ACW belong here
 * (the product) and must survive a provider swap.
 */

export type CallLineId = string;

export type CallPhase =
  | 'idle'
  | 'dialing'
  | 'ringing'
  | 'connected'
  | 'on_hold'
  | 'wrapping'
  | 'ended'
  | 'failed';

export interface CallLine {
  id: CallLineId;
  contactId: string;
  phone: string;
  phase: CallPhase;
  startedAt?: string;
  connectedAt?: string;
  endedAt?: string;
  durationSec?: number;
  recordingUrl?: string;
}

export interface DialerEvent {
  type:
    | 'dial'
    | 'ring'
    | 'connect'
    | 'hold'
    | 'resume'
    | 'hangup'
    | 'wrap_done'
    | 'fail';
  lineId: CallLineId;
  at: string;
  payload?: Record<string, unknown>;
}