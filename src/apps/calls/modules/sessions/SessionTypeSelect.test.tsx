// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionTypeSelect } from './SessionTypeSelect';

afterEach(cleanup);

describe('SessionTypeSelect', () => {
  it('renders all 3 session type cards and the header', () => {
    render(
      <SessionTypeSelect
        onBack={vi.fn()}
        onSelectClassic={vi.fn()}
        onSelectAbm={vi.fn()}
        onSelectCsv={vi.fn()}
      />,
    );

    // Header
    expect(screen.getByText('Nouvelle séance')).toBeTruthy();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Choisir le type de séance' }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retour' })).toBeTruthy();

    // Card 1 — Liste classique
    expect(screen.getByText('Liste classique')).toBeTruthy();
    expect(
      screen.getByText(
        'Composer une liste de contacts depuis Salesforce avec des filtres',
      ),
    ).toBeTruthy();
    expect(screen.getByText('📋')).toBeTruthy();

    // Card 2 — Comptes précis (ABM)
    expect(screen.getByText('Comptes précis (ABM)')).toBeTruthy();
    expect(
      screen.getByText(
        'Cibler des comptes spécifiques et leurs contacts décisionnaires',
      ),
    ).toBeTruthy();
    expect(screen.getByText('🎯')).toBeTruthy();

    // Card 3 — Import CSV (désactivée avec badge Bientôt)
    expect(screen.getByText('Import CSV')).toBeTruthy();
    expect(
      screen.getByText('Importer une liste de contacts depuis un fichier CSV'),
    ).toBeTruthy();
    expect(screen.getByText('📄')).toBeTruthy();
    expect(screen.getByText('Bientôt')).toBeTruthy();
  });

  it('calls onSelectClassic when clicking the classic card or pressing Enter/Space', async () => {
    const user = userEvent.setup();
    const onSelectClassic = vi.fn();

    render(
      <SessionTypeSelect
        onBack={vi.fn()}
        onSelectClassic={onSelectClassic}
        onSelectAbm={vi.fn()}
        onSelectCsv={vi.fn()}
      />,
    );

    const classicCard = screen.getByRole('button', {
      name: /Liste classique/i,
    });

    // Clic souris
    await user.click(classicCard);
    expect(onSelectClassic).toHaveBeenCalledTimes(1);

    // Clavier Enter
    classicCard.focus();
    await user.keyboard('{Enter}');
    expect(onSelectClassic).toHaveBeenCalledTimes(2);

    // Clavier Space
    await user.keyboard(' ');
    expect(onSelectClassic).toHaveBeenCalledTimes(3);
  });

  it('calls onSelectAbm when clicking the ABM card or pressing Enter/Space', async () => {
    const user = userEvent.setup();
    const onSelectAbm = vi.fn();

    render(
      <SessionTypeSelect
        onBack={vi.fn()}
        onSelectClassic={vi.fn()}
        onSelectAbm={onSelectAbm}
        onSelectCsv={vi.fn()}
      />,
    );

    const abmCard = screen.getByRole('button', {
      name: /Comptes précis \(ABM\)/i,
    });

    // Clic souris
    await user.click(abmCard);
    expect(onSelectAbm).toHaveBeenCalledTimes(1);

    // Clavier Enter
    abmCard.focus();
    await user.keyboard('{Enter}');
    expect(onSelectAbm).toHaveBeenCalledTimes(2);

    // Clavier Space
    await user.keyboard(' ');
    expect(onSelectAbm).toHaveBeenCalledTimes(3);
  });

  it('does not call onSelectCsv when clicking the disabled CSV card', async () => {
    const user = userEvent.setup();
    const onSelectCsv = vi.fn();

    render(
      <SessionTypeSelect
        onBack={vi.fn()}
        onSelectClassic={vi.fn()}
        onSelectAbm={vi.fn()}
        onSelectCsv={onSelectCsv}
      />,
    );

    const csvCard = screen.getByRole('button', {
      name: /Import CSV/i,
    });

    expect(csvCard.getAttribute('aria-disabled')).toBe('true');

    await user.click(csvCard);
    expect(onSelectCsv).not.toHaveBeenCalled();
  });

  it('calls onBack when clicking the Retour button', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();

    render(
      <SessionTypeSelect
        onBack={onBack}
        onSelectClassic={vi.fn()}
        onSelectAbm={vi.fn()}
        onSelectCsv={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Retour' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
