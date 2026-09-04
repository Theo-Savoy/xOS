// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PeriodSelector, type PeriodSelection } from './PeriodSelector';

afterEach(cleanup);

function Harness({
  onChange = vi.fn(),
}: {
  onChange?: (value: PeriodSelection) => void;
}) {
  const [value, setValue] = useState<PeriodSelection>({
    mode: 'fy',
    fy: 'FY26',
    semester: 'S1',
  });

  return (
    <PeriodSelector
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

describe('PeriodSelector', () => {
  it('bascule de FY vers une comparaison S1 / S2 sans masquer l’exercice', () => {
    render(<Harness />);

    expect(
      screen.getByRole('button', { name: 'FY' }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(screen.queryByRole('button', { name: 'S1' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Semestre' }));

    expect(
      screen
        .getByRole('button', { name: 'Semestre' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      screen.getByRole('button', { name: 'S1' }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(screen.getByText('FY26')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'S2' }));
    expect(
      screen.getByRole('button', { name: 'S2' }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(screen.getByText('01/01/2026 → 30/06/2026')).toBeTruthy();
  });

  it('bascule de FY vers Trimestre avec T1 à T4', () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: 'Trimestre' }));

    expect(
      screen
        .getByRole('button', { name: 'Trimestre' })
        .getAttribute('aria-pressed'),
    ).toBe('true');

    // Par défaut, quarter n'est pas défini dans le mode FY du Harness initial,
    // mais on s'assure qu'on peut cliquer sur T2
    fireEvent.click(screen.getByRole('button', { name: 'T2' }));
    expect(
      screen.getByRole('button', { name: 'T2' }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(screen.getByText('01/10/2025 → 31/12/2025')).toBeTruthy();
  });

  it('propose FY22 à FY26 dans le sélecteur d’exercice', () => {
    render(<Harness />);

    const group = screen.getByRole('group', { name: 'Exercice' });
    const buttons = Array.from(group.querySelectorAll('button'));

    expect(buttons.map((btn) => btn.textContent)).toEqual([
      'FY22',
      'FY23',
      'FY24',
      'FY25',
      'FY26',
    ]);
  });
  it('propose les exercices strictement antérieurs (min FY22) dans Comparer avec', () => {
    render(<Harness />);

    const group = screen.getByRole('group', { name: 'Comparer avec' });
    const buttons = Array.from(group.querySelectorAll('button'));

    expect(buttons.map((btn) => btn.textContent)).toEqual([
      'FY22',
      'FY23',
      'FY24',
      'FY25',
    ]);
  });

  it('affiche les bornes FY avant de basculer en semestre', () => {
    render(<Harness />);
    expect(screen.getByText('01/07/2025 → 30/06/2026')).toBeTruthy();
  });
});
