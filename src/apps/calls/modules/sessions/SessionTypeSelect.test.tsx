// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionTypeSelect } from './SessionTypeSelect';

afterEach(cleanup);

describe('SessionTypeSelect', () => {
  it('renders all 5 session type cards and the header', () => {
    render(
      <SessionTypeSelect
        onBack={vi.fn()}
        onSelectClassic={vi.fn()}
        onSelectAbm={vi.fn()}
        onSelectReport={vi.fn()}
        onSelectCsv={vi.fn()}
        onSelectSurgical={vi.fn()}
      />,
    );

    // Header
    expect(screen.queryByText('Nouvelle séance')).toBeNull();
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

    // Card 3 — Rapport Salesforce
    expect(screen.getByText('Rapport Salesforce')).toBeTruthy();
    expect(
      screen.getByText('Créer des séances depuis un rapport Salesforce'),
    ).toBeTruthy();
    expect(screen.getByText('📊')).toBeTruthy();
    expect(screen.getByText('Nouveau')).toBeTruthy();

    // Card 4 — Import CSV (désactivée avec badge Bientôt)
    expect(screen.getByText('Import CSV')).toBeTruthy();
    expect(
      screen.getByText('Importer une liste de contacts depuis un fichier CSV'),
    ).toBeTruthy();
    expect(screen.getByText('📄')).toBeTruthy();
    expect(screen.getAllByText('Bientôt')).toHaveLength(2);

    // Card 5 — Séance chirurgicale (désactivée avec badge Bientôt)
    expect(screen.getByText('Séance chirurgicale')).toBeTruthy();
    expect(
      screen.getByText(
        'Ajouter individuellement des contacts, recherche par nom ou email',
      ),
    ).toBeTruthy();
    expect(screen.getByText('🔬')).toBeTruthy();
  });

  it('calls onSelectClassic when clicking the classic card or pressing Enter/Space', async () => {
    const user = userEvent.setup();
    const onSelectClassic = vi.fn();

    render(
      <SessionTypeSelect
        onBack={vi.fn()}
        onSelectClassic={onSelectClassic}
        onSelectAbm={vi.fn()}
        onSelectReport={vi.fn()}
        onSelectCsv={vi.fn()}
        onSelectSurgical={vi.fn()}
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
        onSelectReport={vi.fn()}
        onSelectCsv={vi.fn()}
        onSelectSurgical={vi.fn()}
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

  it('calls onSelectReport when clicking the Salesforce report card or pressing Enter/Space', async () => {
    const user = userEvent.setup();
    const onSelectReport = vi.fn();

    render(
      <SessionTypeSelect
        onBack={vi.fn()}
        onSelectClassic={vi.fn()}
        onSelectAbm={vi.fn()}
        onSelectReport={onSelectReport}
        onSelectCsv={vi.fn()}
        onSelectSurgical={vi.fn()}
      />,
    );

    const reportCard = screen.getByRole('button', {
      name: /Rapport Salesforce/i,
    });

    // Clic souris
    await user.click(reportCard);
    expect(onSelectReport).toHaveBeenCalledTimes(1);

    // Clavier Enter
    reportCard.focus();
    await user.keyboard('{Enter}');
    expect(onSelectReport).toHaveBeenCalledTimes(2);

    // Clavier Space
    await user.keyboard(' ');
    expect(onSelectReport).toHaveBeenCalledTimes(3);
  });

  it('does not call onSelectCsv when clicking the disabled CSV card', async () => {
    const user = userEvent.setup();
    const onSelectCsv = vi.fn();

    render(
      <SessionTypeSelect
        onBack={vi.fn()}
        onSelectClassic={vi.fn()}
        onSelectAbm={vi.fn()}
        onSelectReport={vi.fn()}
        onSelectCsv={onSelectCsv}
        onSelectSurgical={vi.fn()}
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
        onSelectReport={vi.fn()}
        onSelectCsv={vi.fn()}
        onSelectSurgical={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Retour' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
