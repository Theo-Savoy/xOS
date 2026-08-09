// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDialerPool } from './useDialerPool';

/**
 * Test d'intégration du pool (lot 11.5).
 * simulate:true = mode démo : fetchRtcToken n'est JAMAIS appelé, aucun réseau
 * réel (G2). Les numéros de démo sont masqués (jamais composables).
 */

const { mockCreateRtcClient, mockFetchRtcToken, mockNotifyCallStarted, mockNotifyCallEnded } = vi.hoisted(() => ({
  mockCreateRtcClient: vi.fn(),
  mockFetchRtcToken: vi.fn(),
  mockNotifyCallStarted: vi.fn(),
  mockNotifyCallEnded: vi.fn(),
}));

vi.mock('../infrastructure/telnyx/rtcClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/telnyx/rtcClient')>()),
  createRtcClient: mockCreateRtcClient,
}));

vi.mock('../dialerApi', () => ({
  fetchRtcToken: mockFetchRtcToken,
  // Lot 11.7 : registre serveur — ouvert avant composition, clos à la fin.
  notifyCallStarted: mockNotifyCallStarted,
  notifyCallEnded: mockNotifyCallEnded,
  callBlockedMessage: (e: unknown) => String((e as Error)?.message ?? e),
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
  // F2 : les assertions portent sur les NOMBRES d'appels — vider les compteurs
  // entre chaque cas (les tests antérieurs n'assertaient que l'état, pas les
  // appels, d'où l'absence de clear jusque-là).
  vi.clearAllMocks();
  mockFetchRtcToken.mockResolvedValue({ dry_run: false, token: 'rtc-tok', expires_in: 600 });
  // Lot 11.7 : le registre accepte chaque composition par défaut.
  mockNotifyCallStarted.mockResolvedValue({ call_record_id: 1 });
  mockNotifyCallEnded.mockResolvedValue(true);
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
    // Le socket du client mocké s'ouvre : composeAfterPlay lance dialSlot.
    // Lot 11.7 : dialSlot ouvre le registre (await notifyCallStarted) AVANT
    // de composer — act async pour flusher les microtâches sous fake timers,
    // sinon les timeouts 20 s seraient armés après l'avance d'horloge.
    await act(async () => {
      client.emit('telnyx.ready');
    });
    // 3 lignes en dialing, chaque dialSlot a armé son timeout 20s.
    expect(result.current.state.lines.every((l) => l.phase === 'dialing')).toBe(true);

    // Skip manuel de la ligne 1 → compose le suivant (334).
    await act(async () => {
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

/**
 * F2 (audit lot-11.7) : les chemins de clôture du pool doivent être asservis
 * à des assertions — mockNotifyCallEnded était câblé sans jamais être vérifié.
 */
describe('useDialerPool — lot 11.7 clôture du registre (F2)', () => {
  it('F2 : skip réel clôt le registre de la ligne sautée (budget libéré)', async () => {
    const client = makeClient();
    mockCreateRtcClient.mockResolvedValue(client);
    const { result } = renderHook(() => useDialerPool({ token: 'tok', size: 3, simulate: false }));

    act(() => {
      result.current.setQueue(['+331****1111', '+332****2222']);
    });
    await act(async () => {
      await result.current.play();
    });
    await act(async () => {
      client.emit('telnyx.ready');
    });
    expect(mockNotifyCallStarted).toHaveBeenCalledTimes(2);

    await act(async () => {
      result.current.skip(0);
    });

    expect(mockNotifyCallEnded).toHaveBeenCalledTimes(1);
    expect(mockNotifyCallEnded.mock.calls[0][1]).toMatchObject({
      status: 'no_answer',
      answered: false, // jamais décrochée → budget libéré
    });
  });

  it('F2 : unmount avec lignes ouvertes clôt CHAQUE registre', async () => {
    const client = makeClient();
    mockCreateRtcClient.mockResolvedValue(client);
    const { result, unmount } = renderHook(() =>
      useDialerPool({ token: 'tok', size: 3, simulate: false }),
    );

    act(() => {
      result.current.setQueue(['+331****1111', '+332****2222', '+333****3333']);
    });
    await act(async () => {
      await result.current.play();
    });
    await act(async () => {
      client.emit('telnyx.ready');
    });
    expect(mockNotifyCallStarted).toHaveBeenCalledTimes(3);

    unmount();

    expect(mockNotifyCallEnded).toHaveBeenCalledTimes(3);
  });

  it('F2 : notification ended d’un slot clôt son registre (consommé si décroché)', async () => {
    const client = makeClient();
    mockCreateRtcClient.mockResolvedValue(client);
    const { result } = renderHook(() => useDialerPool({ token: 'tok', size: 3, simulate: false }));

    act(() => {
      result.current.setQueue(['+331****1111']);
    });
    await act(async () => {
      await result.current.play();
    });
    await act(async () => {
      client.emit('telnyx.ready');
    });
    expect(mockNotifyCallStarted).toHaveBeenCalledTimes(1);

    // Décroché sur le slot 0 puis fin d'appel (callId pool-slot-0).
    act(() => {
      client.emit('telnyx.notification', { call: { state: 'active', callId: 'pool-slot-0' } });
    });
    act(() => {
      client.emit('telnyx.notification', { call: { state: 'hangup', callId: 'pool-slot-0' } });
    });

    expect(mockNotifyCallEnded).toHaveBeenCalledTimes(1);
    expect(mockNotifyCallEnded.mock.calls[0][1]).toMatchObject({
      status: 'ended',
      answered: true,
    });
  });
});
