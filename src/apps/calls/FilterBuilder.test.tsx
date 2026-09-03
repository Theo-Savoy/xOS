// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyFilterTree } from '../../crm';
import { FilterBuilder } from './FilterBuilder';

afterEach(() => {
  cleanup();
});

const filterBuilderProps = {
  filters: emptyFilterTree(),
  onChange: vi.fn(),
  previewCount: null as number | null,
  previewLoading: false,
  matchCount: null as number | null,
  matchCountCapped: false,
  matchCountLoading: false,
  matchCountError: null,
  contactLimit: 200 as const,
  onContactLimitChange: vi.fn(),
  maxPerCompany: null as null,
  onMaxPerCompanyChange: vi.fn(),
  presets: [] as [],
  presetsLoading: false,
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
