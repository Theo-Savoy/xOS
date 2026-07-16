// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PreSessionFlow } from './PreSessionFlow';
import type { SessionContact, SessionDetail } from './types';

const callsCss = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('node:fs') as typeof import('node:fs');
  return fs.readFileSync('src/apps/calls/calls.css', 'utf8');
});

afterEach(cleanup);

const session: SessionDetail = {
  id: 1,
  name: 'Séance test',
  status: 'active',
  created_at: '2026-07-10T10:00:00Z',
};

const contact: SessionContact = {
  id: 1,
  position: 1,
  sf_contact_id: '003000000000001',
  sf_account_id: '001000000000001',
  contact_name: 'Alice Martin',
  account_name: 'Acme',
  phone: '0102030405',
  title: 'Responsable formation',
  linkedin_url: null,
  status: 'pending',
  outcome: null,
  comments: null,
  sf_task_id: null,
  sf_event_id: null,
  called_at: null,
};

function renderFlow(onLaunch = vi.fn().mockResolvedValue(undefined)) {
  render(
    <PreSessionFlow
      session={session}
      contacts={[contact]}
      onLaunch={onLaunch}
      onCancel={vi.fn()}
    />,
  );
  return onLaunch;
}

describe('PreSessionFlow', () => {
  it('closes on Escape and restores focus to the element that opened it', () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const onCancel = vi.fn();

    function Harness() {
      return (
        <PreSessionFlow
          session={session}
          contacts={[contact]}
          onLaunch={vi.fn().mockResolvedValue(undefined)}
          onCancel={onCancel}
        />
      );
    }

    render(<Harness />);
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('shows the operator briefing with the objective in the same view', () => {
    renderFlow();

    expect(
      screen.getByRole('heading', { name: 'Aujourd’hui, tu appelles' }),
    ).toBeTruthy();
    expect(screen.getByText('contacts à appeler')).toBeTruthy();
    expect(screen.getByText('comptes')).toBeTruthy();
    expect(screen.getByText('Acme')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /RDV$/ })).toHaveLength(8);
    expect(
      screen.getByRole('button', { name: '5 RDV' }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(screen.getByRole('button', { name: 'Préparer le départ' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeTruthy();
    expect(screen.queryByText('Matière')).toBeNull();
    expect(screen.queryByText('Cap')).toBeNull();
  });

  it('lets the operator choose an objective before preparing the departure', async () => {
    const user = userEvent.setup();
    renderFlow();

    await user.click(screen.getByRole('button', { name: '6 RDV' }));
    expect(screen.getByText('Objectif RDV : 6')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Préparer le départ' }));

    expect(screen.getByRole('status').textContent).toContain('3');
    expect(screen.getByText('Objectif RDV')).toBeTruthy();
    expect(screen.queryByText('Aujourd’hui, tu appelles')).toBeNull();
    expect(screen.queryByText('Acme')).toBeNull();
  });

  it('automatically hands off at GO exactly once', async () => {
    const user = userEvent.setup();
    const onLaunch = renderFlow();

    await user.click(screen.getByRole('button', { name: 'Préparer le départ' }));

    await waitFor(() => expect(onLaunch).toHaveBeenCalledTimes(1), {
      timeout: 3000,
    });
    expect(screen.getByRole('status').textContent).toContain('GO');
    expect(screen.getByText('Ouverture de la séance…')).toBeTruthy();
    expect(
      screen.getByRole('dialog').querySelector('.calls-pre-session')?.className,
    ).toContain('calls-pre-session--handoff');
    expect(screen.queryByRole('button', { name: 'Entrer dans la séance' })).toBeNull();
    expect(onLaunch).toHaveBeenCalledWith(5);

    await new Promise((resolve) => window.setTimeout(resolve, 250));
    expect(onLaunch).toHaveBeenCalledTimes(1);
  });

  it('keeps launch failures visible and allows one deliberate retry', async () => {
    const user = userEvent.setup();
    const onLaunch = vi
      .fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(undefined);
    renderFlow(onLaunch);

    await user.click(screen.getByRole('button', { name: 'Préparer le départ' }));
    await screen.findByRole(
      'alert',
      { name: 'Échec du départ' },
      { timeout: 3000 },
    );

    expect(
      screen.getByText(
        'Le départ n’a pas abouti. Vérifie la connexion puis relance.',
      ),
    ).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Relancer le départ' }));
    await waitFor(() => expect(onLaunch).toHaveBeenCalledTimes(2), {
      timeout: 1000,
    });
  });

  it('uses concrete French field copy', () => {
    renderFlow();

    expect(screen.getByText('Aujourd’hui, tu appelles')).toBeTruthy();
    expect(screen.getByText('Objectif RDV')).toBeTruthy();
    expect(screen.getByText('Préparer le départ')).toBeTruthy();
    expect(screen.getAllByText(/premier appel/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Matière|Cap|Manifeste/)).toBeNull();
  });

  it('exposes the briefing and activation safeguards in the calls stylesheet', () => {
    expect(callsCss).toContain('.calls-pre-session');
    expect(callsCss).toContain('max-height: calc(100dvh - 2rem)');
    expect(callsCss).toContain('.calls-pre-session__accounts');
    expect(callsCss).toContain('.calls-pre-session__briefing');
    expect(callsCss).toContain('.calls-pre-session__activation');
    expect(callsCss).toContain('calls-pre-session-handoff');
    expect(callsCss).toContain('prefers-reduced-motion: reduce');
  });
});
