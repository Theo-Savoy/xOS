// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRtcCall } from './useRtcCall';
import type { RtcClientHandle } from '../infrastructure/telnyx/rtcClient';

/**
 * §8.1 (audit 11.13) — deux appels consécutifs séparés par un raccroché
 * DISTANT. Le prospect raccroche : le SDK notifie 'hangup', la phase passe à
 * 'ended', mais hangup() n'est jamais appelé → le client n°1 reste connecté
 * avec ses listeners. Sans déconnexion explicite au début de startCall, un
 * socket.close tardif du client n°1 fait échouer l'appel n°2.
 *
 * On ne mocke QUE createRtcClient / fetchRtcToken : les helpers réels
 * (safeHangup, safeDisconnect, telnyxPhase) restent dans le chemin testé.
 */

const { mockCreateRtcClient, mockFetchRtcToken } = vi.hoisted(() => ({
  mockCreateRtcClient: vi.fn(),
  mockFetchRtcToken: vi.fn(),
}));

vi.mock('../infrastructure/telnyx/rtcClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/telnyx/rtcClient')>()),
  createRtcClient: mockCreateRtcClient,
}));

vi.mock('../dialerApi', () => ({
  fetchRtcToken: mockFetchRtcToken,
}));

type FakeClient = RtcClientHandle & {
  listeners: Record<string, (data: unknown) => void>;
  disconnect: ReturnType<typeof vi.fn>;
  emit: (event: string, data?: unknown) => void;
};

function makeClient(): FakeClient {
  const listeners: Record<string, (data: unknown) => void> = {};
  return {
    listeners,
    on: (event: string, cb: (data: unknown) => void) => {
      listeners[event] = cb;
    },
    connect: vi.fn(async () => {}),
    newCall: vi.fn(() => ({ hangup: vi.fn() })),
    disconnect: vi.fn(),
    emit: (event, data) => listeners[event]?.(data),
  } as FakeClient;
}

beforeEach(() => {
  mockFetchRtcToken.mockResolvedValue({ dry_run: false, token: 'rtc-tok', expires_in: 600 });
  Object.defineProperty(window.navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [] }) },
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('useRtcCall — §8.1 client précédent', () => {
  it('déconnecte le client de l’appel n°1 avant de créer celui de l’appel n°2', async () => {
    const client1 = makeClient();
    const client2 = makeClient();
    mockCreateRtcClient.mockResolvedValueOnce(client1).mockResolvedValueOnce(client2);

    const { result } = renderHook(() => useRtcCall({ token: 'tok', dryRun: false }));

    await act(async () => {
      await result.current.startCall('+33123456789');
    });
    expect(mockCreateRtcClient).toHaveBeenCalledTimes(1);

    // Le prospect raccroche : notification SDK seule, PAS de hangup() côté UI.
    act(() => {
      client1.emit('telnyx.notification', { call: { state: 'hangup', callId: 'c1' } });
    });
    expect(result.current.phase).toBe('ended');
    expect(client1.disconnect).not.toHaveBeenCalled();

    // Appel n°2 sur un autre contact (la garde ne bloque que dialing/connected).
    await act(async () => {
      await result.current.startCall('+33987654321');
    });

    expect(client1.disconnect).toHaveBeenCalledTimes(1);
    expect(mockCreateRtcClient).toHaveBeenCalledTimes(2);

    // Le client n°1, orphelin, ne doit plus pouvoir écraser l’appel n°2.
    act(() => {
      client1.emit('telnyx.socket.close');
    });
    expect(result.current.phase).not.toBe('failed');
  });

  it('n’hérite pas du timeout de diagnostic 20 s de l’appel précédent', async () => {
    vi.useFakeTimers();
    const client1 = makeClient();
    const client2 = makeClient();
    mockCreateRtcClient.mockResolvedValueOnce(client1).mockResolvedValueOnce(client2);

    const { result } = renderHook(() => useRtcCall({ token: 'tok', dryRun: false }));

    await act(async () => {
      await result.current.startCall('+33123456789');
    });
    // 15 s plus tard le prospect raccroche : le timeout de l'appel n°1 est
    // encore armé (il n'expire qu'à t+20 s).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    act(() => {
      client1.emit('telnyx.notification', { call: { state: 'hangup', callId: 'c1' } });
    });

    await act(async () => {
      await result.current.startCall('+33987654321');
    });
    // t+21 s : le timeout résiduel de l'appel n°1 aurait fait passer l'appel
    // n°2 (en 'dialing') en 'failed'.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });

    expect(result.current.phase).not.toBe('failed');
    expect(result.current.error).toBeNull();
    vi.useRealTimers();
  });

  // Même famille que §8.1, côté timers de simulation : hangup() arme un retour
  // à 'idle' à 1,5 s. Si l'agent rappelle tout de suite, ce timer résiduel
  // remettait l'appel n°2 (en cours de composition) à 'idle'.
  it('n’hérite pas du retour à idle armé par le hangup précédent', async () => {
    vi.useFakeTimers();
    mockCreateRtcClient.mockResolvedValueOnce(makeClient()).mockResolvedValueOnce(makeClient());

    const { result } = renderHook(() => useRtcCall({ token: 'tok', dryRun: false }));

    await act(async () => {
      await result.current.startCall('+33123456789');
    });
    act(() => {
      result.current.hangup(); // wrapping → idle dans 1,5 s
    });
    expect(result.current.phase).toBe('wrapping');

    await act(async () => {
      await result.current.startCall('+33987654321');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600);
    });

    expect(result.current.phase).toBe('dialing');
    vi.useRealTimers();
  });
});
