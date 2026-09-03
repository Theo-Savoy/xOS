// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyFilterTree } from '../../crm';
import { FilterBuilder } from './FilterBuilder';

afterEach(() => {
  cleanup();
});

const filterBuilderProps = {
  filters: emptyFilterTree(),
  onChange: vi.fn(),
  presets: [] as [],
  savingPreset: false,
  currentUserId: 'user-1',
  onLoadPreset: vi.fn(),
  onSavePreset: vi.fn(),
  onDeletePreset: vi.fn(),
};

function contactSectionTitle(): HTMLElement {
  const title = screen.getByText('Contact').closest('.calls-fb-section__title');
  if (!(title instanceof HTMLElement)) {
    throw new Error('Contact section title not found');
  }
  return title;
}

describe('FilterBuilder — champ zombie Niveau de décision', () => {
  it('does not render the Niveau de décision chip group', () => {
    render(<FilterBuilder {...filterBuilderProps} />);

    expect(screen.queryByText('Niveau de décision')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Décideur (+)' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Influenceur (=)' })).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Non décideur (-)' }),
    ).toBeNull();
  });

  it('does not count niveau_decision toward the contact filter badge', () => {
    render(
      <FilterBuilder
        {...filterBuilderProps}
        filters={{
          ...emptyFilterTree(),
          contact: {
            ...emptyFilterTree().contact,
            niveau_decision: ['+'],
          },
        }}
      />,
    );

    expect(within(contactSectionTitle()).queryByLabelText(/filtre/)).toBeNull();
  });

  it('still counts other contact filters in the section badge', () => {
    render(
      <FilterBuilder
        {...filterBuilderProps}
        filters={{
          ...emptyFilterTree(),
          contact: {
            ...emptyFilterTree().contact,
            fonctions: ['responsable_formation'],
          },
        }}
      />,
    );

    expect(
      within(contactSectionTitle()).getByLabelText('1 filtre actif'),
    ).toBeTruthy();
  });
});

describe('FilterBuilder — carte Enregistrer compacte', () => {
  it('shows the name field and actions without a details disclosure', async () => {
    const user = userEvent.setup();
    const onSavePreset = vi.fn();
    render(
      <FilterBuilder {...filterBuilderProps} onSavePreset={onSavePreset} />,
    );

    expect(screen.queryByText('Enregistrer cette recherche')).toBeNull();
    expect(screen.queryByText('Garder ce filtre pour plus tard')).toBeNull();
    expect(document.querySelector('.calls-fb-save-card details')).toBeNull();
    expect(document.querySelector('.calls-fb-save-card summary')).toBeNull();

    const nameField = screen.getByLabelText('Nom du filtre');
    expect(nameField).toBeTruthy();
    expect(screen.getByRole('button', { name: 'OK' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: "Partager à l'équipe" }),
    ).toBeTruthy();

    await user.type(nameField, 'Relance Q4');
    await user.click(screen.getByRole('button', { name: 'OK' }));
    expect(onSavePreset).toHaveBeenCalledWith('Relance Q4', false);
  });

  it('does not render a duplicate match-count footer', () => {
    render(
      <FilterBuilder
        {...filterBuilderProps}
      />,
    );
    expect(document.querySelector('.calls-fb-footer')).toBeNull();
    expect(screen.queryByText(/dans les filtres/)).toBeNull();
  });
});
