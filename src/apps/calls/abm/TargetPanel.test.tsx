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
  return new Map([[account.id, { account, contactIds: new Set(ids) }]]);
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

  const handleSetRetained = (accountId: string, contactIds: Set<string>) => {
    setTargetList((prev) => {
      const next = new Map(prev);
      const entry = next.get(accountId);
      if (!entry) return prev;
      next.set(accountId, { ...entry, contactIds });
      return next;
    });
  };

  return (
    <>
      <TargetPanel
        targetList={targetList}
        onToggleContact={handleToggle}
        onSetRetainedContacts={handleSetRetained}
        onRemoveAccount={(accountId) =>
          setTargetList((prev) => {
            const next = new Map(prev);
            next.delete(accountId);
            return next;
          })
        }
        onRestoreAccount={(entry) =>
          setTargetList((prev) => {
            const next = new Map(prev);
            next.set(entry.account.id, entry);
            return next;
          })
        }
        onClearTarget={() => setTargetList(new Map())}
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
    const initial = makeTargetList(
      [marie, alice],
      [marie.sf_contact_id, alice.sf_contact_id],
    );

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

    // Aucun canal coché = aucun filtre : les deux contacts sont visibles.
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

    // Décocher le canal ré-affiche tout, sans toucher à la sélection.
    await user.click(screen.getByRole('button', { name: 'A téléphone' }));

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

  it('combines phone AND email channel filters cumulatively (OR)', async () => {
    const user = userEvent.setup();
    render(<Harness initial={makeTargetList([marie, jean, alice])} />);

    // Marie : téléphone + email, Jean : téléphone seul, Alice : email seule.
    await user.click(screen.getByRole('button', { name: 'A téléphone' }));
    expect(screen.queryByText('Alice Martin')).toBeNull();
    expect(screen.getByText('Marie Dupont')).toBeTruthy();
    expect(screen.getByText('Jean Petit')).toBeTruthy();

    // Cumul : téléphone OU email → les trois contacts sont visibles.
    await user.click(screen.getByRole('button', { name: 'A email' }));
    expect(screen.getByText('Marie Dupont')).toBeTruthy();
    expect(screen.getByText('Jean Petit')).toBeTruthy();
    expect(screen.getByText('Alice Martin')).toBeTruthy();

    // Décocher téléphone : ne restent que les contacts avec email.
    await user.click(screen.getByRole('button', { name: 'A téléphone' }));
    expect(screen.queryByText('Jean Petit')).toBeNull();
    expect(screen.getByText('Marie Dupont')).toBeTruthy();
    expect(screen.getByText('Alice Martin')).toBeTruthy();
  });

  it('keeps the retained-contacts counter stable across filters', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={makeTargetList(
          [marie, jean, alice],
          [marie.sf_contact_id, jean.sf_contact_id, alice.sf_contact_id],
        )}
      />,
    );

    const summary = () =>
      within(panel()).getByText(/1 compte · 3 contacts retenus/);
    expect(summary()).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'A téléphone' }));
    expect(summary()).toBeTruthy();
    expect(screen.getByText('1 contact masqué par le filtre')).toBeTruthy();

    // Cumul téléphone + email : les trois contacts sont visibles, plus de masquage.
    await user.click(screen.getByRole('button', { name: 'A email' }));
    expect(summary()).toBeTruthy();
    expect(screen.queryByText(/masqué/)).toBeNull();
    expect(screen.getByText('Alice Martin')).toBeTruthy();
    expect(screen.getByText('Jean Petit')).toBeTruthy();

    // Plus aucun canal coché : plus de masquage par canal.
    await user.click(screen.getByRole('button', { name: 'A téléphone' }));
    await user.click(screen.getByRole('button', { name: 'A email' }));
    expect(summary()).toBeTruthy();
    expect(screen.queryByText(/masqué/)).toBeNull();
    expect(screen.getByText('Jean Petit')).toBeTruthy();

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

  it('renders the composer as a plan card with classic contact sections', () => {
    const { container } = render(
      <Harness initial={makeTargetList([marie, jean, alice])} />,
    );

    expect(container.querySelector('.calls-plan-card')).toBeTruthy();
    expect(container.querySelector('.calls-fb-section')).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: 'Comptes ciblés' }),
    ).toBeTruthy();
    expect(screen.getByText('Marie Dupont')).toBeTruthy();
    expect(screen.getByText('Jean Petit')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Vider le panier' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Retirer ACME de la cible' }),
    ).toBeTruthy();
  });

  it('selecting a fonction preset retains only matching contacts', async () => {
    const user = userEvent.setup();
    const initial = makeTargetList(
      [marie, jean, alice],
      [marie.sf_contact_id, jean.sf_contact_id, alice.sf_contact_id],
    );

    render(<Harness initial={initial} />);

    // Cocher « Responsable formation » : seule Marie (titre matchant) reste retenue.
    await user.click(
      screen.getByRole('button', { name: 'Responsable formation' }),
    );

    expect(screen.getByTestId('selection-dump').textContent).toBe(
      JSON.stringify([
        {
          accountId: '001acme',
          contactIds: ['003marie'],
        },
      ]),
    );
    expect(
      within(panel()).getByText(/1 compte · 1 contact retenu/),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole('checkbox', {
          name: 'Retenir Marie Dupont',
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
    expect(
      screen.queryByRole('checkbox', { name: 'Retenir Jean Petit' }),
    ).toBeNull();

    // Décocher le preset : tout est resélectionné.
    await user.click(
      screen.getByRole('button', { name: 'Responsable formation' }),
    );

    expect(screen.getByTestId('selection-dump').textContent).toBe(
      JSON.stringify(serializeTarget(initial)),
    );
    expect(
      within(panel()).getByText(/1 compte · 3 contacts retenus/),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole('checkbox', {
          name: 'Retenir Jean Petit',
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
  });

  it('soft-removes an account into a restorable section, preserving its contact selection', async () => {
    const user = userEvent.setup();
    const initial = makeTargetList([marie, jean], [marie.sf_contact_id]);

    render(<Harness initial={initial} />);

    await user.click(
      screen.getByRole('button', { name: 'Retirer ACME de la cible' }),
    );

    // Le compte sort du récap (plus compté comme ciblé)…
    expect(
      within(panel()).getByText(/0 compte · 0 contact retenu/),
    ).toBeTruthy();
    // …mais reste listé comme retiré, grisé, avec sa sélection conservée.
    expect(screen.getByText('ACME')).toBeTruthy();
    expect(screen.getByText('1 contact')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Remettre ACME dans la cible' }),
    ).toBeTruthy();

    // Remettre : le compte revient avec sa sélection d'origine (Marie only).
    await user.click(
      screen.getByRole('button', { name: 'Remettre ACME dans la cible' }),
    );

    expect(screen.getByTestId('selection-dump').textContent).toBe(
      JSON.stringify(serializeTarget(initial)),
    );
    expect(
      within(panel()).getByText(/1 compte · 1 contact retenu/),
    ).toBeTruthy();
    expect(screen.queryByText(/Comptes retirés/)).toBeNull();
  });
});
