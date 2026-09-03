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

  it('propose FY22 à FY26 dans le sélecteur d’exercice', () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: 'Exercice' }));

    expect(
      screen.getAllByRole('option').map((option) => option.textContent),
    ).toEqual(['FY22', 'FY23', 'FY24', 'FY25', 'FY26']);
  });

  it('affiche les bornes FY avant de basculer en semestre', () => {
    render(<Harness />);
    expect(screen.getByText('01/07/2025 → 30/06/2026')).toBeTruthy();
  });
});
