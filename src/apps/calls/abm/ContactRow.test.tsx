// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AccountSearchContact } from '../types';
import { ContactRow } from './ContactRow';

afterEach(() => {
  cleanup();
});

function makeContact(
  overrides: Partial<AccountSearchContact> = {},
): AccountSearchContact {
  return {
    sf_contact_id: '003000000000001AAA',
    contact_name: 'Marie Dupont',
    title: 'Responsable formation',
    phone: null,
    mobile_phone: '+33600000000',
    email: 'marie@acme.fr',
    decision_level: '+',
    ...overrides,
  };
}

describe('ContactRow — badges niveau de décision', () => {
  it('does not render Décideur / Influenceur / Non décideur tags', () => {
    const { rerender } = render(
      <ContactRow
        contact={makeContact({ decision_level: '+' })}
        selected
        onToggle={vi.fn()}
      />,
    );
    expect(screen.queryByText('Décideur')).toBeNull();

    rerender(
      <ContactRow
        contact={makeContact({ decision_level: '=' })}
        selected
        onToggle={vi.fn()}
      />,
    );
    expect(screen.queryByText('Influenceur')).toBeNull();

    rerender(
      <ContactRow
        contact={makeContact({ decision_level: '-' })}
        selected
        onToggle={vi.fn()}
      />,
    );
    expect(screen.queryByText('Non décideur')).toBeNull();
  });

  it('still renders name, title, and channel icons', () => {
    render(
      <ContactRow
        contact={makeContact()}
        selected={false}
        onToggle={vi.fn()}
      />,
    );

    expect(screen.getByText('Marie Dupont')).toBeTruthy();
    expect(screen.getByText('Responsable formation')).toBeTruthy();
    expect(screen.getByLabelText('Téléphone disponible')).toBeTruthy();
    expect(screen.getByLabelText('Email disponible')).toBeTruthy();
  });
});
