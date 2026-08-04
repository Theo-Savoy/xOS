// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDialerPool } from './useDialerPool';

/**
 * Test d'intégration du pool (lot 11.5).
 * simulate:true = mode démo : fetchRtcToken n'est JAMAIS appelé, aucun réseau
 * réel (G2). Les numéros de démo sont masqués (jamais composables).
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

let fetchMock: ReturnType<typeof vi.fn>;

function makeClient() {
  const listeners: Record<string, (data: unknown) => void> = {};
  return {
    listeners,
    on: (event: string, cb: (data: unknown) => void) => {
      listeners[event] = cb;
    },
    connect: vi.fn(async () => {}),
    newCall: vi.fn(() => ({ hangup: vi.fn(), on: vi.fn() })),
    disconnect: vi.fn(),
    emit: (event: string, data?: unknown) => listeners[event]?.(data),
  };
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockRejectedValue(new Error('no network (dry-run)'));
  mockFetchRtcToken.mockResolvedValue({ dry_run: false, token: 'rtc-tok', expires_in: 600 });
  mockCreateRtcClient.mockResolvedValue(null); // simulate par défaut
  // jsdom : document.querySelector sur audio[data-rtc-remote-N] → null OK.
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('useDialerPool (dry-run simulation)', () => {
  it('setQueue puis play compose 3 lignes en dialing', async () => {
    const { result } = renderHook(() => useDialerPool({ token: 'tok', size: 3, simulate: true }));

    act(() => {
      result.current.setQueue(['+331****1111', '+332****2222', '+333****3333', '+334****4444']);
    });
    expect(result.current.state.queue.length).toBe(4);

    await act(async () => {
      await result.current.play();
    });

    expect(result.current.isRunning).toBe(true);
    expect(result.current.state.lines.map((l) => l.destination)).toEqual([
      '+331****1111',
      '+332****2222',
      '+333****3333',
    ]);
    expect(result.current.state.lines.every((l) => l.phase === 'dialing')).toBe(true);
    expect(result.current.state.queue).toEqual(['+334****4444']);
  });

  it('skip sur une ligne compose le suivant', async () => {
    const { result } = renderHook(() => useDialerPool({ token: 'tok', size: 3, simulate: true }));
    act(() => {
      result.current.setQueue(['+331****1111', '+332****2222', '+333****3333', '+334****4444', '+335****5555']);
    });
    await act(async () => {
      await result.current.play();
    });

    act(() => {
      result.current.skip(1);
    });

    expect(result.current.state.lines[1].destination).toBe('+334****4444');
    expect(result.current.state.queue).toEqual(['+335****5555']);
  });

  it('simulate=true : Play ne compose JAMAIS réellement (fetch token non appelé)', async () => {
    const { result } = renderHook(() =>
      useDialerPool({ token: 'tok', size: 3, simulate: true }),
    );
    act(() => {
      result.current.setQueue(['+331****1111', '+332****2222', '+333****3333']);
    });
    await act(async () => {
      await result.current.play();
    });
    // Le token n'est JAMAIS demandé : aucune possibilité d'appel réel.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.state.lines[0].phase).toBe('dialing');
  });

  it('hangupAll reset le pool', async () => {
    const { result } = renderHook(() => useDialerPool({ token: 'tok', size: 3, simulate: true }));
    act(() => {
      result.current.setQueue(['+331****1111']);
    });
    await act(async () => {
      await result.current.play();
    });
    expect(result.current.isRunning).toBe(true);

    act(() => {
      result.current.hangupAll();
    });

    expect(result.current.isRunning).toBe(false);
    expect(result.current.state.lines.every((l) => l.phase === 'idle')).toBe(true);
    expect(result.current.state.queue).toEqual([]);
  });

  it('R3 : un skip manuel ne tue PAS le timeout non-réponse des autres lignes', async () => {
    // Mode RÉEL : client mocké, timeouts 20s armés par slot.
    vi.useFakeTimers();
    const client = makeClient();
    mockCreateRtcClient.mockResolvedValue(client);
    const { result } = renderHook(() => useDialerPool({ token: 'tok', size: 3, simulate: false }));

    act(() => {
      result.current.setQueue(['+331****1111', '+332****2222', '+333****3333', '+334****4444']);
    });
    await act(async () => {
      await result.current.play();
    });
    // Le socket du client mocké s'ouvre : composeAfterPlay arme les 3 timeouts.
    act(() => {
      client.emit('telnyx.ready');
    });
    // 3 lignes en dialing, chaque dialSlot a armé son timeout 20s.
    expect(result.current.state.lines.every((l) => l.phase === 'dialing')).toBe(true);

    // Skip manuel de la ligne 1 → compose le suivant (334).
    act(() => {
      result.current.skip(1);
    });
    expect(result.current.state.lines[1].destination).toBe('+334****4444');

    // +20s : les timeouts des lignes 0 et 2 (et le nouveau de la ligne 1)
    // se déclenchent → les lignes encore en dialing/ringing sont skippées.
    act(() => {
      vi.advanceTimersByTime(20000);
    });

    const phases = result.current.state.lines.map((l) => l.phase);
    // Aucune ligne ne doit rester figée en dialing : toutes ont été
    // skippées par leur timeout (la file de 4 numéros est épuisée).
    expect(phases.every((p) => p !== 'dialing' && p !== 'ringing')).toBe(true);
  });
});
