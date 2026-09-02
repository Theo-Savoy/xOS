// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDialerPool } from './useDialerPool';

const {
  mockCreateRtcClient,
  mockFetchRtcToken,
  mockStartPowerPool,
  mockFetchPowerPoolStatus,
  mockHangupPowerPool,
} = vi.hoisted(() => ({
  mockCreateRtcClient: vi.fn(),
  mockFetchRtcToken: vi.fn(),
  mockStartPowerPool: vi.fn(),
  mockFetchPowerPoolStatus: vi.fn(),
  mockHangupPowerPool: vi.fn(),
}));

vi.mock('../infrastructure/telnyx/rtcClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/telnyx/rtcClient')>()),
  createRtcClient: mockCreateRtcClient,
}));
vi.mock('../dialerApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../dialerApi')>()),
  fetchRtcToken: mockFetchRtcToken,
  startPowerPool: mockStartPowerPool,
  fetchPowerPoolStatus: mockFetchPowerPoolStatus,
  hangupPowerPool: mockHangupPowerPool,
}));

function makeClient({ deferConnect = false } = {}) {
  const listeners: Record<string, (data?: unknown) => void> = {};
  let releaseConnect = () => {};
  const connectBarrier = deferConnect
    ? new Promise<void>((resolve) => { releaseConnect = resolve; })
    : Promise.resolve();
  return {
    on: vi.fn((event: string, callback: (data: unknown) => void) => {
      listeners[event] = callback;
    }),
    connect: vi.fn(async () => { await connectBarrier; }),
    newCall: vi.fn(),
    disconnect: vi.fn(),
    emit: (event: string, data?: unknown) => listeners[event]?.(data),
    emitReady: () => listeners['telnyx.ready']?.(),
    emitError: (error: unknown) => listeners['telnyx.error']?.(error),
    releaseConnect: () => releaseConnect(),
  };
}

type FakeClient = ReturnType<typeof makeClient>;

async function waitForReadyListener(client: FakeClient) {
  for (let i = 0; i < 30; i += 1) {
    if (client.on.mock.calls.some((call) => call[0] === 'telnyx.ready')) return;
    await Promise.resolve();
  }
  throw new Error('telnyx.ready listener was not registered');
}

/** Play jusqu’à ready : prouve que pool_start n’est pas parti avant l’événement. */
async function playUntilReady(
  result: { current: { play: () => Promise<void> } },
  client: FakeClient,
) {
  const startCalls = mockStartPowerPool.mock.calls.length;
  const playPromise = result.current.play();
  await waitForReadyListener(client);
  expect(mockStartPowerPool).toHaveBeenCalledTimes(startCalls);
  client.emitReady();
  await playPromise;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchRtcToken.mockResolvedValue({
    dry_run: false, token: 'rtc-token', caller_number: '+339****9999',
    sip_uri: 'sip:agent@sip.telnyx.com', expires_in: 600,
  });
  mockStartPowerPool.mockResolvedValue({
    dry_run: false, session_id: 'pool-1',
    calls: [{ slot: 0, call_record_id: 1, status: 'dialing' }],
  });
  mockFetchPowerPoolStatus.mockResolvedValue({
    id: 'pool-1', parallelism: 3, status: 'dialing', winner_call_id: null,
    calls: [{ id: 1, pool_slot: 0, to_number: '+331****11', status: 'dialing', amd_result: null }],
  });
  mockHangupPowerPool.mockResolvedValue(undefined);
});

afterEach(async () => {
  await act(async () => {
    cleanup();
    await Promise.resolve();
    await Promise.resolve();
  });
  vi.useRealTimers();
});

describe('useDialerPool — Voice API + poste WebRTC (lot 11.8)', () => {
  it('n’envoie pool_start qu’après telnyx.ready, jamais avant', async () => {
    const client = makeClient({ deferConnect: true });
    mockCreateRtcClient.mockResolvedValue(client);
    const { result } = renderHook(() => useDialerPool({ token: 'tok', size: 3 }));
    act(() => result.current.setQueue(['+33100000001', '+33100000002', '+33100000003']));

    let playPromise!: Promise<void>;
    await act(async () => {
      playPromise = result.current.play();
      await waitForReadyListener(client);
    });
    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(mockStartPowerPool).not.toHaveBeenCalled();

    await act(async () => {
      client.releaseConnect();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockStartPowerPool).not.toHaveBeenCalled();

    await act(async () => {
      client.emitReady();
      await playPromise;
    });

    expect(mockStartPowerPool).toHaveBeenCalledTimes(1);
    expect(mockStartPowerPool).toHaveBeenCalledWith('tok', {
      destinations: ['+33100000001', '+33100000002', '+33100000003'],
      parallelism: 3,
    });
    expect(client.newCall).not.toHaveBeenCalled();
    expect(client.connect.mock.invocationCallOrder[0]).toBeLessThan(
      mockStartPowerPool.mock.invocationCallOrder[0],
    );
  });

  it('accepte uniquement l’invitation agent et garde le son muet avant active', async () => {
    const client = makeClient();
    mockCreateRtcClient.mockResolvedValue(client);
    const audio = document.createElement('audio');
    audio.dataset.rtcAgent = '';
    audio.muted = true;
    document.body.append(audio);
    const call = {
      direction: 'inbound', state: 'ringing', callId: 'agent-1',
      options: { clientState: btoa(JSON.stringify({ poolSessionId: 'pool-1', kind: 'agent' })) },
      answer: vi.fn(), muteAudio: vi.fn(), unmuteAudio: vi.fn(), hangup: vi.fn(),
    };
    const { result } = renderHook(() => useDialerPool({ token: 'tok', size: 1 }));
    act(() => result.current.setQueue(['+33100000001']));
    await act(async () => { await playUntilReady(result, client); });

    act(() => client.emit('telnyx.notification', { call }));
    expect(call.answer).toHaveBeenCalledWith({ remoteElement: audio });
    expect(audio.muted).toBe(true);
    expect(result.current.agentConnected).toBe(false);

    call.state = 'active';
    act(() => client.emit('telnyx.notification', { call }));
    expect(audio.muted).toBe(false);
    expect(call.unmuteAudio).toHaveBeenCalled();
    expect(result.current.agentConnected).toBe(true);
    audio.remove();
  });

  it('raccroche le pool serveur et le leg agent', async () => {
    const client = makeClient();
    mockCreateRtcClient.mockResolvedValue(client);
    const call = {
      direction: 'inbound', state: 'ringing', callId: 'agent',
      options: { clientState: btoa(JSON.stringify({ poolSessionId: 'pool-1', kind: 'agent' })) },
      answer: vi.fn(), hangup: vi.fn(),
    };
    const { result } = renderHook(() => useDialerPool({ token: 'tok', size: 1 }));
    act(() => result.current.setQueue(['+33100000001']));
    await act(async () => { await playUntilReady(result, client); });
    act(() => client.emit('telnyx.notification', { call }));
    act(() => result.current.hangupAll());
    expect(call.hangup).toHaveBeenCalled();
    expect(mockHangupPowerPool).toHaveBeenCalledWith('tok', 'pool-1');
    expect(result.current.isRunning).toBe(false);
  });

  it('mode démo ne demande ni token ni appel serveur', async () => {
    const { result } = renderHook(() => useDialerPool({ token: 'tok', size: 3, simulate: true }));
    act(() => result.current.setQueue(['+331****1111', '+332****2222', '+333****3333']));
    await act(async () => result.current.play());
    expect(mockFetchRtcToken).not.toHaveBeenCalled();
    expect(mockStartPowerPool).not.toHaveBeenCalled();
    expect(result.current.state.lines.every((line) => line.phase === 'dialing')).toBe(true);
  });

  it('relance immédiatement la dernière file sans dépendre d’un render React intermédiaire', async () => {
    const client = makeClient();
    mockCreateRtcClient.mockResolvedValue(client);
    const { result } = renderHook(() => useDialerPool({ token: 'tok', size: 1 }));
    act(() => result.current.setQueue(['+33100000001']));
    await act(async () => { await playUntilReady(result, client); });
    act(() => result.current.hangupAll());
    mockStartPowerPool.mockClear();

    await act(async () => result.current.redial());

    expect(mockStartPowerPool).toHaveBeenCalledWith('tok', {
      destinations: ['+33100000001'], parallelism: 1,
    });
  });

  it('un statut terminal répété ne consomme jamais la file locale', async () => {
    const client = makeClient();
    mockCreateRtcClient.mockResolvedValue(client);
    mockFetchPowerPoolStatus.mockResolvedValue({
      id: 'pool-1', parallelism: 1, status: 'dialing', winner_call_id: null,
      calls: [{ id: 1, pool_slot: 0, to_number: '+331****01', status: 'no_answer', amd_result: null }],
    });
    const { result } = renderHook(() => useDialerPool({ token: 'tok', size: 1 }));
    act(() => result.current.setQueue(['+331****0001', '+331****0002', '+331****0003']));
    await act(async () => { await playUntilReady(result, client); });
    expect(result.current.state.queue).toEqual(['+331****0002', '+331****0003']);
    await act(async () => { await Promise.resolve(); });
    expect(result.current.state.queue).toEqual(['+331****0002', '+331****0003']);
    expect(result.current.state.lines[0].phase).toBe('skipped');
  });

  it('refuse une invitation de la bonne session si elle ne cible pas le poste agent', async () => {
    const client = makeClient();
    mockCreateRtcClient.mockResolvedValue(client);
    const prospect = {
      direction: 'inbound', state: 'ringing',
      options: { clientState: btoa(JSON.stringify({ poolSessionId: 'pool-1', kind: 'prospect' })) },
      answer: vi.fn(),
    };
    const { result } = renderHook(() => useDialerPool({ token: 'tok', size: 1 }));
    act(() => result.current.setQueue(['+331****0001']));
    await act(async () => { await playUntilReady(result, client); });
    act(() => client.emit('telnyx.notification', { call: prospect }));
    expect(prospect.answer).not.toHaveBeenCalled();
  });

  it('refuse une invitation inbound sans corrélation de session', async () => {
    const client = makeClient();
    mockCreateRtcClient.mockResolvedValue(client);
    const foreign = { direction: 'inbound', state: 'ringing', answer: vi.fn() };
    const { result } = renderHook(() => useDialerPool({ token: 'tok', size: 1 }));
    act(() => result.current.setQueue(['+331****0001']));
    await act(async () => { await playUntilReady(result, client); });
    act(() => client.emit('telnyx.notification', { call: foreign }));
    expect(foreign.answer).not.toHaveBeenCalled();
  });

  it('le premier humain reflété par le serveur coupe visuellement les autres lignes', async () => {
    vi.useFakeTimers();
    const client = makeClient();
    mockCreateRtcClient.mockResolvedValue(client);
    mockFetchPowerPoolStatus.mockResolvedValue({
      id: 'pool-1', parallelism: 3, status: 'connecting', winner_call_id: 2,
      calls: [
        { id: 1, pool_slot: 0, to_number: '+331****01', status: 'ended', amd_result: null },
        { id: 2, pool_slot: 1, to_number: '+331****02', status: 'bridged', amd_result: 'human' },
        { id: 3, pool_slot: 2, to_number: '+331****03', status: 'ended', amd_result: null },
      ],
    });
    const { result } = renderHook(() => useDialerPool({ token: 'tok', size: 3 }));
    act(() => result.current.setQueue(['+33100000001', '+33100000002', '+33100000003']));
    await act(async () => { await playUntilReady(result, client); });
    expect(result.current.state.lines[1].phase).toBe('connected');
    expect(result.current.state.lines[0].phase).toBe('skipped');
    expect(result.current.state.lines[2].phase).toBe('skipped');
  });

  it('timeout/error readiness : zéro pool_start et aucune bascule silencieuse en démo', async () => {
    vi.useFakeTimers();
    const timeoutClient = makeClient();
    mockCreateRtcClient.mockResolvedValue(timeoutClient);
    const timeoutHook = renderHook(() => useDialerPool({ token: 'tok', size: 1 }));
    act(() => timeoutHook.result.current.setQueue(['+331****0001']));
    // Capture la destination réelle depuis le state (le rendu d'affichage
    // masque les numéros ; on compare à la valeur réelle, jamais à une chaîne
    // recopiée depuis un log).
    const timeoutQueueDestination = timeoutHook.result.current.state.queue[0];

    let timeoutPlay!: Promise<void>;
    await act(async () => {
      timeoutPlay = timeoutHook.result.current.play();
      await waitForReadyListener(timeoutClient);
    });
    expect(mockStartPowerPool).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
      await timeoutPlay;
    });

    expect(mockStartPowerPool).not.toHaveBeenCalled();
    expect(timeoutHook.result.current.state.error).toMatch(/Aucune réponse du serveur WebRTC après 20 s/);
    expect(timeoutHook.result.current.state.lines.some((line) => line.phase === 'connected')).toBe(false);
    expect(timeoutHook.result.current.state.lines.some((line) => line.phase === 'ringing')).toBe(false);
    // F-04 (audit 11.8) : rollback complet — aucune ligne restée 'dialing',
    // la file d'origine est restaurée, Play redevient fonctionnel.
    expect(timeoutHook.result.current.state.lines.some((line) => line.phase === 'dialing')).toBe(false);
    expect(timeoutHook.result.current.state.lines.some((line) => line.phase === 'skipped')).toBe(false);
    expect(timeoutHook.result.current.state.queue).toEqual([timeoutQueueDestination]);
    expect(timeoutHook.result.current.isRunning).toBe(false);
    timeoutHook.unmount();

    vi.clearAllMocks();
    mockFetchRtcToken.mockResolvedValue({
      dry_run: false, token: 'rtc-token', caller_number: '+339****9999',
      sip_uri: 'sip:agent@sip.telnyx.com', expires_in: 600,
    });
    mockStartPowerPool.mockResolvedValue({
      dry_run: false, session_id: 'pool-1',
      calls: [{ slot: 0, call_record_id: 1, status: 'dialing' }],
    });

    const errorClient = makeClient();
    mockCreateRtcClient.mockResolvedValue(errorClient);
    const errorHook = renderHook(() => useDialerPool({ token: 'tok', size: 1 }));
    act(() => errorHook.result.current.setQueue(['+33100000001']));

    let errorPlay!: Promise<void>;
    await act(async () => {
      errorPlay = errorHook.result.current.play();
      await waitForReadyListener(errorClient);
    });
    expect(mockStartPowerPool).not.toHaveBeenCalled();

    await act(async () => {
      errorClient.emitError(new Error('socket refused'));
      await errorPlay;
      await vi.advanceTimersByTimeAsync(2500);
    });

    expect(mockStartPowerPool).not.toHaveBeenCalled();
    expect(errorHook.result.current.state.error).toMatch(/socket refused/);
    expect(errorHook.result.current.state.lines.some((line) => line.phase === 'connected')).toBe(false);
    expect(errorHook.result.current.state.lines.some((line) => line.phase === 'ringing')).toBe(false);
    expect(errorHook.result.current.isRunning).toBe(false);
  });

  it('completed + winner_call_id sans bridged : redial ne recompose jamais le gagnant', async () => {
    const client = makeClient();
    mockCreateRtcClient.mockResolvedValue(client);
    mockFetchPowerPoolStatus.mockResolvedValue({
      id: 'pool-1', parallelism: 2, status: 'completed', winner_call_id: 1,
      calls: [
        { id: 1, pool_slot: 0, to_number: '+331****01', status: 'ended', amd_result: 'human' },
        { id: 2, pool_slot: 1, to_number: '+331****02', status: 'ended', amd_result: null },
      ],
    });
    const { result } = renderHook(() => useDialerPool({ token: 'tok', size: 2 }));
    act(() => result.current.setQueue(['+33100000001', '+33100000002']));
    await act(async () => { await playUntilReady(result, client); });

    expect(result.current.state.lines[0].phase).toBe('ended');
    expect(result.current.state.lines[1].phase).toBe('skipped');
    expect(result.current.isRunning).toBe(false);

    mockStartPowerPool.mockClear();
    await act(async () => result.current.redial());

    expect(mockStartPowerPool).toHaveBeenCalledTimes(1);
    expect(mockStartPowerPool).toHaveBeenCalledWith('tok', {
      destinations: ['+33100000002'],
      parallelism: 2,
    });
    expect(mockStartPowerPool.mock.calls[0][1].destinations).not.toContain('+33100000001');
  });

  it('hangupPowerPool rejeté : session retryable et un second hangup rappelle le serveur', async () => {
    const client = makeClient();
    mockCreateRtcClient.mockResolvedValue(client);
    mockHangupPowerPool.mockRejectedValue(new Error('network down'));
    const { result } = renderHook(() => useDialerPool({ token: 'tok', size: 1 }));
    act(() => result.current.setQueue(['+33100000001']));
    await act(async () => { await playUntilReady(result, client); });

    await act(async () => {
      result.current.hangupAll();
    });

    expect(mockHangupPowerPool).toHaveBeenCalledTimes(1);
    expect(mockHangupPowerPool).toHaveBeenCalledWith('tok', 'pool-1');
    expect(result.current.state.error).toMatch(/Raccrochage serveur impossible/);
    expect(result.current.isRunning).toBe(false);
    // F-05 (audit 11.8) : l'échec expose un CTA de réessai — la session
    // serveur est conservée, pas de reset visuel prématuré.
    expect(result.current.hangupRetryable).toBe(true);

    await act(async () => {
      result.current.hangupAll();
    });

    expect(mockHangupPowerPool).toHaveBeenCalledTimes(2);
    expect(mockHangupPowerPool).toHaveBeenNthCalledWith(2, 'tok', 'pool-1');
    expect(result.current.state.error).toMatch(/Raccrochage serveur impossible/);
    expect(result.current.hangupRetryable).toBe(true);
    mockHangupPowerPool.mockResolvedValue(undefined);
  });

  it('F-03 : pool_start dry_run hors simulate → pool-error, pas de bascule silencieuse en démo', async () => {
    const client = makeClient();
    mockCreateRtcClient.mockResolvedValue(client);
    mockStartPowerPool.mockResolvedValue({ dry_run: true, session_id: null, calls: [] });
    const { result } = renderHook(() => useDialerPool({ token: 'tok', size: 1 }));
    act(() => result.current.setQueue(['+331****0001']));
    await act(async () => { await playUntilReady(result, client); });

    expect(mockStartPowerPool).toHaveBeenCalledTimes(1);
    expect(result.current.state.error).toMatch(/Session power refusée par le serveur/);
    // Aucune bascule en démo : pas de ligne ringing/connected (les timers de
    // démo n'ont pas été armés), le pool n'est pas "running".
    expect(result.current.isRunning).toBe(false);
    expect(result.current.state.lines.some((line) => ['ringing', 'connected'].includes(line.phase))).toBe(false);
  });

  it('annule l’attente ready au démontage sans pool_start tardif', async () => {
    vi.useFakeTimers();
    const client = makeClient();
    mockCreateRtcClient.mockResolvedValue(client);
    const { result, unmount } = renderHook(() => useDialerPool({ token: 'tok', size: 1 }));
    act(() => result.current.setQueue(['+33100000001']));

    let playPromise!: Promise<void>;
    await act(async () => {
      playPromise = result.current.play();
      await waitForReadyListener(client);
    });
    expect(mockStartPowerPool).not.toHaveBeenCalled();

    unmount();
    await act(async () => {
      await playPromise;
      await vi.advanceTimersByTimeAsync(20_000);
    });

    expect(mockStartPowerPool).not.toHaveBeenCalled();
  });

  it('transmet la séance et les contacts alignés, puis expose le contact gagnant', async () => {
    const client = makeClient();
    mockCreateRtcClient.mockResolvedValue(client);
    mockFetchPowerPoolStatus.mockResolvedValue({
      id: 'pool-1', parallelism: 2, status: 'active', winner_call_id: 7,
      calls: [
        { id: 7, pool_slot: 0, contact_id: 42, to_number: '+331****11', status: 'bridged', amd_result: 'human' },
        { id: 8, pool_slot: 1, contact_id: 43, to_number: '+331****22', status: 'ended', amd_result: null },
      ],
    });
    const { result } = renderHook(() =>
      useDialerPool({ token: 'tok', size: 2, callSessionId: 7 }));
    act(() => result.current.setQueue(['+33100000001', '+33100000002'], [42, 43]));

    await act(async () => { await playUntilReady(result, client); });

    expect(mockStartPowerPool).toHaveBeenCalledWith('tok', {
      destinations: ['+33100000001', '+33100000002'],
      parallelism: 2,
      sessionId: 7,
      contactIds: [42, 43],
    });
    expect(result.current.winnerContactId).toBe(42);
  });

  it('omet contact_ids si une destination du cycle n’est rattachée à aucune fiche', async () => {
    const client = makeClient();
    mockCreateRtcClient.mockResolvedValue(client);
    const { result } = renderHook(() =>
      useDialerPool({ token: 'tok', size: 2, callSessionId: 7 }));
    // File remplacée sans contactIds : l'alignement 1:1 n'est plus prouvable.
    act(() => result.current.setQueue(['+33100000001', '+33100000002']));

    await act(async () => { await playUntilReady(result, client); });

    expect(mockStartPowerPool).toHaveBeenCalledWith('tok', {
      destinations: ['+33100000001', '+33100000002'],
      parallelism: 2,
    });
  });

  it('transmet le numéro sortant choisi et explique un refus de quota', async () => {
    const client = makeClient();
    mockCreateRtcClient.mockResolvedValue(client);
    mockStartPowerPool.mockResolvedValue({
      dry_run: false, session_id: 'pool-1',
      calls: [{ slot: 0, status: 'failed', error: 'calls_exceeded_user_day' }],
    });
    const { result } = renderHook(() =>
      useDialerPool({ token: 'tok', size: 1, callerNumber: '+33184800001' }));
    act(() => result.current.setQueue(['+33100000001']));

    await act(async () => { await playUntilReady(result, client); });

    expect(mockStartPowerPool).toHaveBeenCalledWith('tok', {
      destinations: ['+33100000001'], parallelism: 1, callerNumber: '+33184800001',
    });
    expect(result.current.state.error).toBe('Limite d’appels du jour atteinte.');
    // La file est rendue pour permettre un nouveau Play une fois le quota levé.
    expect(result.current.state.queue).toEqual(['+33100000001']);
    expect(result.current.isRunning).toBe(false);
    expect(mockFetchPowerPoolStatus).not.toHaveBeenCalled();
  });

  it('ignore un rechargement de file pendant un cycle en cours', async () => {
    const client = makeClient();
    mockCreateRtcClient.mockResolvedValue(client);
    const { result } = renderHook(() => useDialerPool({ token: 'tok', size: 1 }));
    act(() => result.current.setQueue(['+33100000001', '+33100000009']));

    await act(async () => { await playUntilReady(result, client); });
    expect(result.current.isRunning).toBe(true);

    act(() => result.current.setQueue(['+33100000002'], [1]));
    expect(result.current.state.lines[0].destination).toBe('+33100000001');
    expect(result.current.state.queue).toEqual(['+33100000009']);
  });
});
