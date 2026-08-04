// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDialerPool } from './useDialerPool';

/**
 * Test d'intégration du pool en dry-run (lot 11.5).
 * En dry-run : fetchRtcToken échoue (ou renvoie token:null) → client null →
 * simulation. Le réducteur pilote les lignes, aucun paquet réel ne part.
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
    const { result } = renderHook(() => useDialerPool({ token: 'tok', size: 3 }));

    act(() => {
      result.current.setQueue(['+33111111111', '+33222222222', '+33333333333', '+33444444444']);
    });
    expect(result.current.state.queue.length).toBe(4);

    await act(async () => {
      await result.current.play();
    });

    expect(result.current.isRunning).toBe(true);
    expect(result.current.state.lines.map((l) => l.destination)).toEqual([
      '+33111111111',
      '+33222222222',
      '+33333333333',
    ]);
    expect(result.current.state.lines.every((l) => l.phase === 'dialing')).toBe(true);
    expect(result.current.state.queue).toEqual(['+33444444444']);
  });

  it('skip sur une ligne compose le suivant', async () => {
    const { result } = renderHook(() => useDialerPool({ token: 'tok', size: 3 }));
    act(() => {
      result.current.setQueue(['+33111111111', '+33222222222', '+33333333333', '+33444444444', '+33555555555']);
    });
    await act(async () => {
      await result.current.play();
    });

    act(() => {
      result.current.skip(1);
    });

    expect(result.current.state.lines[1].destination).toBe('+33444444444');
    expect(result.current.state.queue).toEqual(['+33555555555']);
  });

  it('hangupAll reset le pool', async () => {
    const { result } = renderHook(() => useDialerPool({ token: 'tok', size: 3 }));
    act(() => {
      result.current.setQueue(['+33111111111']);
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
