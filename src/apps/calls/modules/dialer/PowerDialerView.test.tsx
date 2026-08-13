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

  it('ne rend qu’un poste audio agent, muet tant qu’aucun humain n’est connecté', () => {
    const { container } = render(<PowerDialerView token="tok" onBack={vi.fn()} />);
    expect(container.querySelectorAll('audio')).toHaveLength(1);
    const audio = container.querySelector<HTMLAudioElement>('audio[data-rtc-agent]');
    expect(audio).toBeTruthy();
    expect(audio?.muted).toBe(true);
  });

  it('permet de configurer le nombre d’appels parallèles entre 1 et 5', () => {
    render(<PowerDialerView token="tok" onBack={vi.fn()} />);
    const select = screen.getByLabelText('Appels en parallèle') as HTMLSelectElement;
    expect([...select.options].map((option) => option.value)).toEqual(['1', '2', '3', '4', '5']);
    fireEvent.change(select, { target: { value: '5' } });
    expect(select.value).toBe('5');
  });

  it('rend réellement cinq lignes quand le parallélisme passe à 5', () => {
    render(<PowerDialerView token="tok" onBack={vi.fn()} />);
    fireEvent.click(screen.getByText('Remplir démo'));
    fireEvent.change(screen.getByLabelText('Appels en parallèle'), { target: { value: '5' } });
    fireEvent.click(playButton());
    expect(screen.getAllByText('Composition…')).toHaveLength(5);
    expect(screen.getByText('File d\'attente (2)')).toBeTruthy();
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
    expect(screen.getByLabelText('Indicateurs session').textContent).toContain('3tentés');
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
    expect(screen.getByLabelText('Indicateurs session').textContent).toContain('1connectés');
  });

  it('démo aucune réponse : les lignes sont skippées sans composer de remplaçant', async () => {
    render(<PowerDialerView token="tok" onBack={vi.fn()} />);

    fireEvent.click(screen.getByText('Remplir démo'));
    fireEvent.click(screen.getByText('Démo : réponse humaine')); // bascule en 'aucune réponse'
    fireEvent.click(playButton());

    // t+3s : la ligne 0 est skippée par le timeout simulé. Le serveur ne
    // compose pas automatiquement un remplaçant (lot 11.8) : la ligne garde
    // sa destination en phase skipped et la file ne bouge pas.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3300);
    });

    expect(screen.getByText('Abandonné')).toBeTruthy(); // ligne 0 skippée
    // La ligne skippée garde sa destination d'origine, aucun remplaçant n'est
    // composé dans une ligne (le numéro suivant reste dans la file).
    const lineDests = Array.from(document.querySelectorAll('.calls-power__line-dest'))
      .map((el) => el.textContent);
    expect(lineDests).toContain('+331****1111');
    expect(lineDests).not.toContain('+334****4444');
    expect(screen.getByText('File d\'attente (4)')).toBeTruthy(); // 7 - 3 composés, skip ne consomme rien

    // t+10s : fin de la démo sans réponse, STOP — le cycle se clôt, le bouton
    // de relance revient (les lignes skippées restent relançables).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(7000);
    });
    expect(screen.getByRole('button', { name: /Relancer/ })).toBeTruthy();
  });

  it('Tout raccrocher pendant un cycle reset le pool', () => {
    render(<PowerDialerView token="tok" onBack={vi.fn()} />);

    fireEvent.click(screen.getByText('Remplir démo'));
    fireEvent.click(playButton());

    fireEvent.click(screen.getByText('Tout raccrocher'));

    expect(screen.queryByText('Composition…')).toBeNull();
    expect(playButton()).toBeTruthy();
  });

  it('permet de relancer les appels abandonnés après un cycle', async () => {
    render(<PowerDialerView token="tok" onBack={vi.fn()} />);
    fireEvent.click(screen.getByText('Remplir démo'));
    fireEvent.click(playButton());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10100);
    });
    expect(screen.getByRole('button', { name: /Relancer/ })).toBeTruthy();
  });
});
