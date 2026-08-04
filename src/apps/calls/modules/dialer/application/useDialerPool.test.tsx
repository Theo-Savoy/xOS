// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDialerPool } from './useDialerPool';

/**
 * Test d'intégration du pool (lot 11.5).
 * simulate:true = mode démo : fetchRtcToken n'est JAMAIS appelé, aucun réseau
 * réel (G2). Les numéros de démo sont masqués (jamais composables).
 */

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockRejectedValue(new Error('no network (dry-run)'));
  // jsdom : document.querySelector sur audio[data-rtc-remote-N] → null OK.
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
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
});
