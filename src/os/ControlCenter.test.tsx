// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ControlCenter } from './ControlCenter';
import { NotificationsProvider } from './notificationsStore';

const goalHit = {
  id: 42,
  kind: 'session_goal_hit',
  title: 'Objectif atteint !',
  body: 'Bravo, 10 RDV obtenus.',
  payload: {},
  created_at: '2026-07-13T18:00:00.000Z',
  read_at: null,
};

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
      unsubscribe: vi.fn().mockResolvedValue('ok'),
    })),
  },
}));

describe('ControlCenter', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          return Promise.resolve(new Response('{}', { status: 200 }));
        }
        return Promise.resolve(
          new Response(
            JSON.stringify({ notifications: [goalHit], unread_count: 1 }),
            { status: 200 },
          ),
        );
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('hides a reacted item after the thirty-minute TTL', async () => {
    render(
      <NotificationsProvider>
        <ControlCenter accessToken="token" />
      </NotificationsProvider>,
    );

    screen.getByRole('button', { name: 'Centre de notifications' }).click();
    await waitFor(() => expect(screen.getByText(goalHit.title)).toBeTruthy());
    const user = userEvent.setup();
    await user.click(screen.getByTitle('Réagir 👏'));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    vi.setSystemTime(Date.now() + 30 * 60 * 1000 + 10_000);
    expect(screen.queryByText(goalHit.title)).toBeTruthy();
    // A polling render re-evaluates the locally persisted reaction timestamp.
    act(() => {
      screen.getByRole('button', { name: 'Centre de notifications' }).click();
    });
    act(() => {
      screen.getByRole('button', { name: 'Centre de notifications' }).click();
    });

    expect(screen.queryByText(goalHit.title)).toBeNull();
  });
});
