// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PowerDialerView } from './PowerDialerView';

/**
 * Test UI power dialing (lot 11.6) — mode démo (dry-run).
 * Le pool est en simulation : fetchRtcToken échoue (pas de réseau en test) →
 * client null → phases simulées par timers. Aucun paquet réel ne part.
 */

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockRejectedValue(new Error('no network (test)'));
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function playButton() {
  return screen.getByRole('button', { name: /Play/ });
}

describe('PowerDialerView (mode démo)', () => {
  it('affiche le panneau power et le bouton Play', () => {
    render(<PowerDialerView token="tok" onBack={vi.fn()} />);
    expect(screen.getByText('Session power dialing')).toBeTruthy();
    expect(screen.getByText('Remplir démo')).toBeTruthy();
    expect(playButton()).toBeTruthy();
  });

  it('Play désactivé sans file (rien à composer)', () => {
    render(<PowerDialerView token="tok" onBack={vi.fn()} />);
    expect(playButton().hasAttribute('disabled')).toBe(true);
  });

  it('Remplir démo puis Play : 3 lignes en dialing, file avance', () => {
    render(<PowerDialerView token="tok" onBack={vi.fn()} />);

    fireEvent.click(screen.getByText('Remplir démo'));
    expect(screen.getByText('File d\'attente (7)')).toBeTruthy();

    fireEvent.click(playButton());

    // 3 lignes composées (dialing), file réduite à 4 restants.
    expect(screen.getAllByText('Composition…').length).toBe(3);
    expect(screen.getByText('File d\'attente (4)')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy(); // compteur tentés
  });

  it('après réponse simulée : ligne 0 connectée, les autres coupées (démo)', async () => {
    render(<PowerDialerView token="tok" onBack={vi.fn()} />);

    fireEvent.click(screen.getByText('Remplir démo'));
    fireEvent.click(playButton());

    // Simulation : t+2s la ligne 0 décroche (answered), les autres skipped.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });

    expect(screen.getByText('En communication')).toBeTruthy();
    expect(screen.getAllByText('Abandonné').length).toBe(2);
    expect(screen.getByText('1')).toBeTruthy(); // compteur connectés
  });

  it('démo aucune réponse : les lignes sont skippées, la file avance', async () => {
    render(<PowerDialerView token="tok" onBack={vi.fn()} />);

    fireEvent.click(screen.getByText('Remplir démo'));
    fireEvent.click(screen.getByText('Démo : réponse humaine')); // bascule en 'aucune réponse'
    fireEvent.click(playButton());

    // t+3s : la ligne 0 est skippée par le timeout simulé → le suivant entre
    // à sa place (la ligne change de numéro, phase dialing).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3300);
    });

    expect(screen.getByText('+334****4444')).toBeTruthy(); // le suivant a pris la place
    expect(screen.getByText('File d\'attente (3)')).toBeTruthy(); // 7 - 3 composés - 1 skip

    // t+10s : fin de la démo sans réponse, STOP — le bouton Play revient.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(7000);
    });
    expect(playButton()).toBeTruthy();
  });

  it('Tout raccrocher pendant un cycle reset le pool', () => {
    render(<PowerDialerView token="tok" onBack={vi.fn()} />);

    fireEvent.click(screen.getByText('Remplir démo'));
    fireEvent.click(playButton());

    fireEvent.click(screen.getByText('Tout raccrocher'));

    expect(screen.queryByText('Composition…')).toBeNull();
    expect(playButton()).toBeTruthy();
  });
});
