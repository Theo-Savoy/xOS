// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { todayParisIso } from '../../formControls.helpers';
import { CalendarView } from './CalendarView';

afterEach(cleanup);

function makeSession(id: number, name: string) {
  const today = todayParisIso();
  return {
    id,
    name,
    status: 'active' as const,
    created_at: `${today}T09:00:00Z`,
    scheduled_for: today,
    session_type: 'prospection' as const,
    total: 10,
    called: 0,
    skipped: 0,
    pending: 10,
  };
}

function renderCalendar(
  sessions = [makeSession(1, 'Séance du jour')],
  onOpenSession = vi.fn(),
) {
  return render(
    <CalendarView
      sessions={sessions}
      loading={false}
      error={null}
      onRefresh={vi.fn()}
      onNewSession={vi.fn()}
      onOpenSession={onOpenSession}
    />,
  );
}

describe('CalendarView', () => {
  it('affiche le mois complet sans réintroduire les filtres de la home', async () => {
    const user = userEvent.setup();
    const onOpenSession = vi.fn();
    renderCalendar(undefined, onOpenSession);

    expect(screen.getByRole('heading', { name: 'Calendrier' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mois précédent' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mois suivant' })).toBeTruthy();
    expect(screen.getByRole('button', { name: "Aujourd'hui" })).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Échéance' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Type de séance' })).toBeNull();
    expect(screen.getAllByRole('group').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Séance du jour' }));
    expect(onOpenSession).toHaveBeenCalledWith(1);
  });

  it('ouvre les séances supplémentaires d’une journée dans la modale', async () => {
    const user = userEvent.setup();
    const sessions = [1, 2, 3, 4].map((id) => makeSession(id, `Séance ${id}`));
    renderCalendar(sessions);

    await user.click(
      screen.getByRole('button', { name: /\+1 autres séances/ }),
    );
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Séance 4')).toBeTruthy();
    expect(within(dialog).getByText('Fermer')).toBeTruthy();
  });
});
