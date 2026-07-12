// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BulkActionBar } from './BulkActionBar';

const capabilities = {
  canViewTeam: true,
  canReassign: true,
  canBulkEdit: true,
  canBulkClose: true,
  canManageRules: false,
};

describe('BulkActionBar', () => {
  afterEach(cleanup);
  it('shows the current selection, all-filtered command and capability-gated actions', () => {
    const onSelectAll = vi.fn();
    const onStartAction = vi.fn();
    render(
      <BulkActionBar
        selectedCount={2}
        filteredCount={7}
        currentPageCount={2}
        allFilteredSelected={false}
        capabilities={capabilities}
        onSelectAll={onSelectAll}
        onClear={vi.fn()}
        onStartAction={onStartAction}
      />,
    );

    expect(screen.getByText('2 sélectionnées')).toBeTruthy();
    expect(
      screen.getByRole('button', {
        name: /Sélectionner les 7 résultats filtrés/i,
      }),
    ).toBeTruthy();
    for (const name of [
      'Réassigner le propriétaire',
      'Modifier la date de clôture',
      'Modifier le type de vente',
      'Clore en perdue',
    ]) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
    fireEvent.click(
      screen.getByRole('button', {
        name: /Sélectionner les 7 résultats filtrés/i,
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Clore en perdue' }));
    expect(onSelectAll).toHaveBeenCalledOnce();
    expect(onStartAction).toHaveBeenCalledWith('close-lost');
  });

  it('renders no write action when capabilities prohibit writes', () => {
    render(
      <BulkActionBar
        selectedCount={1}
        filteredCount={1}
        currentPageCount={1}
        allFilteredSelected
        capabilities={{
          ...capabilities,
          canReassign: false,
          canBulkEdit: false,
          canBulkClose: false,
        }}
        onSelectAll={vi.fn()}
        onClear={vi.fn()}
        onStartAction={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole('button', { name: 'Réassigner le propriétaire' }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Modifier la date de clôture' }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Modifier le type de vente' }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Clore en perdue' }),
    ).toBeNull();
  });
});
