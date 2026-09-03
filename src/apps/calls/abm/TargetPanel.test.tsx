// @vitest-environment jsdom

import { useState } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AccountSearchContact, AccountSearchHit } from '../types';
import { TargetPanel, type TargetEntry } from './TargetPanel';

afterEach(() => {
  cleanup();
});

function makeContact(
  overrides: Partial<AccountSearchContact> &
    Pick<AccountSearchContact, 'sf_contact_id' | 'contact_name'>,
): AccountSearchContact {
  return {
    title: null,
    phone: null,
    mobile_phone: null,
    email: null,
    decision_level: null,
    ...overrides,
  };
}

const marie = makeContact({
  sf_contact_id: '003marie',
  contact_name: 'Marie Dupont',
  title: 'Responsable formation',
  mobile_phone: '+33600000000',
  email: 'marie@acme.fr',
});

const jean = makeContact({
  sf_contact_id: '003jean',
  contact_name: 'Jean Petit',
  title: 'Directeur',
  phone: '0102030405',
});

const alice = makeContact({
  sf_contact_id: '003alice',
  contact_name: 'Alice Martin',
  title: 'Chargée de formation',
  email: 'alice@acme.fr',
});

function makeAccount(
  contacts: AccountSearchContact[],
  id = '001acme',
  name = 'ACME',
): AccountSearchHit {
  return {
    id,
    name,
    industry: 'Services informatiques',
    owner_name: 'Paul Martin',
    type_client: 'Client',
    tier: 'A',
    effectif: '251 - 500',
    contacts,
  };
}

function makeTargetList(
  contacts: AccountSearchContact[],
  selectedIds?: string[],
): Map<string, TargetEntry> {
  const account = makeAccount(contacts);
  const ids = selectedIds ?? contacts.map((c) => c.sf_contact_id);
  return new Map([
    [account.id, { account, contactIds: new Set(ids) }],
  ]);
}

function serializeTarget(list: Map<string, TargetEntry>) {
  return Array.from(list.values()).map((entry) => ({
    accountId: entry.account.id,
    contactIds: [...entry.contactIds].sort(),
  }));
}

function Harness({
  initial,
  onToggleContact,
}: {
  initial: Map<string, TargetEntry>;
  onToggleContact?: (accountId: string, contactId: string) => void;
}) {
  const [targetList, setTargetList] = useState(initial);

  const handleToggle = (accountId: string, contactId: string) => {
    onToggleContact?.(accountId, contactId);
    setTargetList((prev) => {
      const next = new Map(prev);
      const entry = next.get(accountId);
      if (!entry) return prev;
      const contactIds = new Set(entry.contactIds);
      if (contactIds.has(contactId)) contactIds.delete(contactId);
      else contactIds.add(contactId);
      next.set(accountId, { ...entry, contactIds });
      return next;
    });
  };

  return (
    <>
      <TargetPanel
        targetList={targetList}
        onToggleContact={handleToggle}
        onRemoveAccount={vi.fn()}
        onClearTarget={vi.fn()}
        onPrepareSessions={vi.fn()}
      />
      <pre data-testid="selection-dump">
        {JSON.stringify(serializeTarget(targetList))}
      </pre>
    </>
  );
}

function panel() {
  return screen.getByLabelText('Panier cible ABM');
}

describe('TargetPanel — filtres de contacts', () => {
  it('never deselects contacts when the channel filter changes', async () => {
    const user = userEvent.setup();
    const onToggleContact = vi.fn();
    const initial = makeTargetList([marie, alice], [
      marie.sf_contact_id,
      alice.sf_contact_id,
    ]);

    render(<Harness initial={initial} onToggleContact={onToggleContact} />);

    expect(
      (
        screen.getByRole('checkbox', {
          name: 'Retenir Marie Dupont',
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
    expect(
      (
        screen.getByRole('checkbox', {
          name: 'Retenir Alice Martin',
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);

    await user.click(screen.getByRole('button', { name: 'A téléphone' }));

    expect(onToggleContact).not.toHaveBeenCalled();
    expect(screen.getByTestId('selection-dump').textContent).toBe(
      JSON.stringify(serializeTarget(initial)),
    );
    expect(
      (
        screen.getByRole('checkbox', {
          name: 'Retenir Marie Dupont',
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
    expect(
      screen.queryByRole('checkbox', { name: 'Retenir Alice Martin' }),
    ).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Tous' }));

    expect(onToggleContact).not.toHaveBeenCalled();
    expect(
      (
        screen.getByRole('checkbox', {
          name: 'Retenir Alice Martin',
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
    expect(screen.getByTestId('selection-dump').textContent).toBe(
      JSON.stringify(serializeTarget(initial)),
    );
  });

  it('keeps the retained-contacts counter stable across filters', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={makeTargetList([marie, jean, alice], [
          marie.sf_contact_id,
          jean.sf_contact_id,
          alice.sf_contact_id,
        ])}
      />,
    );

    const summary = () =>
      within(panel()).getByText(/1 compte · 3 contacts retenus/);
    expect(summary()).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'A téléphone' }));
    expect(summary()).toBeTruthy();
    expect(screen.getByText('1 contact masqué par le filtre')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'A email' }));
    expect(summary()).toBeTruthy();
    expect(screen.getByText('1 contact masqué par le filtre')).toBeTruthy();

    await user.type(
      screen.getByPlaceholderText('Rechercher un contact…'),
      'zzz-nobody',
    );
    expect(summary()).toBeTruthy();
    expect(screen.getByText('3 contacts masqués par le filtre')).toBeTruthy();
  });

  it('combines channel filter AND text search without mutating targetList', async () => {
    const user = userEvent.setup();
    const initial = makeTargetList([marie, jean, alice]);
    const snapshot = serializeTarget(initial);

    render(
      <TargetPanel
        targetList={initial}
        onToggleContact={vi.fn()}
        onRemoveAccount={vi.fn()}
        onClearTarget={vi.fn()}
        onPrepareSessions={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'A email' }));
    await user.type(
      screen.getByPlaceholderText('Rechercher un contact…'),
      'formation',
    );

    expect(screen.getByText('Marie Dupont')).toBeTruthy();
    expect(screen.getByText('Alice Martin')).toBeTruthy();
    expect(screen.queryByText('Jean Petit')).toBeNull();

    await user.clear(screen.getByPlaceholderText('Rechercher un contact…'));
    await user.type(
      screen.getByPlaceholderText('Rechercher un contact…'),
      'jean',
    );

    expect(screen.queryByText('Marie Dupont')).toBeNull();
    expect(screen.queryByText('Alice Martin')).toBeNull();
    expect(screen.queryByText('Jean Petit')).toBeNull();

    expect(serializeTarget(initial)).toEqual(snapshot);
    expect(
      within(panel()).getByText(/1 compte · 3 contacts retenus/),
    ).toBeTruthy();
  });
});
