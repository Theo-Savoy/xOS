// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountSearchView } from './AccountSearchView';
import { fetchAccountsSearch } from './api';
import { todayParisIso, tomorrowParisIso } from './formControls.helpers';
import type { AccountSearchHit, TeamMember } from './types';

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>();
  return { ...actual, fetchAccountsSearch: vi.fn() };
});

const localStore: Record<string, string> = {};
const mockLocalStorage = {
  getItem: vi.fn((key: string) => localStore[key] ?? null),
  setItem: vi.fn((key: string, val: string) => {
    localStore[key] = String(val);
  }),
  removeItem: vi.fn((key: string) => {
    delete localStore[key];
  }),
  clear: vi.fn(() => {
    for (const k of Object.keys(localStore)) delete localStore[k];
  }),
};
Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: mockLocalStorage,
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mockLocalStorage.clear();
});

const acme: AccountSearchHit = {
  id: '001000000000001AAA',
  name: 'ACME',
  industry: 'Services informatiques',
  owner_name: 'Paul Martin',
  type_client: 'Client',
  tier: 'A',
  effectif: '251 - 500',
  contacts: [
    {
      sf_contact_id: '003000000000001AAA',
      contact_name: 'Marie Dupont',
      title: 'Responsable formation',
      phone: null,
      mobile_phone: '+33600000000',
      email: 'marie@acme.fr',
      decision_level: '+',
    },
  ],
};

const acmeSubsidiary: AccountSearchHit = {
  id: '001000000000002AAA',
  name: 'ACME Europe',
  industry: 'Services informatiques',
  owner_name: 'Paul Martin',
  type_client: 'Prospect',
  tier: 'B',
  effectif: '51 - 250',
  contacts: [
    {
      sf_contact_id: '003000000000002AAA',
      contact_name: 'Jean Petit',
      title: 'Directeur formation',
      phone: null,
      mobile_phone: '+33600000001',
      email: 'jean@acme-europe.fr',
      decision_level: '+',
    },
    {
      sf_contact_id: '003000000000003AAA',
      contact_name: 'Alice Martin',
      title: 'Chargée de formation',
      phone: null,
      mobile_phone: '+33600000002',
      email: 'alice@acme-europe.fr',
      decision_level: '-',
    },
  ],
};

const zeroContactAccount: AccountSearchHit = {
  id: '001000000000003AAA',
  name: 'Wayne Enterprises',
  industry: null,
  owner_name: null,
  type_client: null,
  tier: null,
  effectif: null,
  contacts: [],
};

const team: TeamMember[] = [
  { user_id: 'user-1', label: 'Paul Martin', sf_user_id: '005000000000001AAA' },
  {
    user_id: 'map:christophe',
    label: 'Christophe Durand',
    sf_user_id: '005000000000002AAA',
  },
];

function renderView(
  overrides: Partial<Parameters<typeof AccountSearchView>[0]> = {},
) {
  const onBack = overrides.onBack ?? vi.fn();
  const onCreateAudience = overrides.onCreateAudience ?? vi.fn();
  const utils = render(
    <AccountSearchView
      token="token-123"
      onBack={onBack}
      onCreateAudience={onCreateAudience}
      creating={false}
      createError={null}
      team={team}
      {...overrides}
    />,
  );
  return { ...utils, onCreateAudience, onBack };
}

async function chooseNameSearch(
  user: ReturnType<typeof userEvent.setup>,
) {
  if (screen.queryByLabelText('Nom du compte')) return;
  await user.click(
    screen.getByRole('button', { name: /Rechercher par nom/ }),
  );
}

async function chooseFiltersSearch(
  user: ReturnType<typeof userEvent.setup>,
) {
  if (screen.queryByPlaceholderText('Filtrer les secteurs…')) return;
  await user.click(
    screen.getByRole('button', { name: /Rechercher par filtres/ }),
  );
}

function chooseFiltersSearchSync() {
  if (screen.queryByPlaceholderText('Filtrer les secteurs…')) return;
  fireEvent.click(
    screen.getByRole('button', { name: /Rechercher par filtres/ }),
  );
}

async function searchQuery(
  user: ReturnType<typeof userEvent.setup>,
  query: string,
) {
  await chooseNameSearch(user);
  await user.type(screen.getByLabelText('Nom du compte'), query);
  await user.click(screen.getByRole('button', { name: 'Rechercher' }));
}

async function goToComposer(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole('button', { name: 'Continuer vers Composer →' }),
  );
}

async function goToPlanifier(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole('button', { name: 'Continuer vers Planifier →' }),
  );
}

describe('AccountSearchView', () => {
  it('searches, renders grouped account cards, previews the FFD packing, and creates audience sessions', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchAccountsSearch).mockResolvedValue({
      accounts: [acme, acmeSubsidiary],
      truncated: false,
    });
    const { onCreateAudience } = renderView();

    await searchQuery(user, 'ACME');

    await waitFor(() =>
      expect(fetchAccountsSearch).toHaveBeenCalledWith(
        'token-123',
        { q: 'ACME', filters: expect.any(Object) },
        expect.any(Object),
      ),
    );

    expect(await screen.findByText('ACME')).toBeTruthy();
    expect(screen.getByText('ACME Europe')).toBeTruthy();
    expect(screen.getByText('1 contact')).toBeTruthy();
    expect(screen.getByText('2 contacts')).toBeTruthy();

    await user.click(
      screen.getByRole('checkbox', { name: 'Sélectionner ACME' }),
    );
    await user.click(
      screen.getByRole('checkbox', { name: 'Sélectionner ACME Europe' }),
    );

    await goToComposer(user);
    expect(
      screen.getByText(
        (c) => c.includes('2 comptes') && c.includes('3 contacts'),
      ),
    ).toBeTruthy();

    await goToPlanifier(user);
    expect(screen.getByText('Aperçu : 1 séance')).toBeTruthy();

    await user.click(
      screen.getByRole('button', { name: 'Créer 1 séance ABM' }),
    );
    expect(onCreateAudience).toHaveBeenCalledWith(
      expect.objectContaining({
        groups: [
          expect.objectContaining({
            account_ids: expect.arrayContaining([
              '001000000000001AAA',
              '001000000000002AAA',
            ]),
          }),
        ],
        targetSize: 50,
        maxSessions: 5,
        namePrefix: 'ACME',
        excludedCount: 0,
      }),
    );
  });

  it('allows searching with filters only (no name)', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchAccountsSearch).mockResolvedValue({
      accounts: [acme],
      truncated: false,
    });
    renderView();

    expect(
      screen.queryByRole('button', { name: 'Rechercher' }),
    ).toBeNull();

    await chooseFiltersSearch(user);
    await user.click(screen.getByRole('button', { name: 'A' }));

    await waitFor(() =>
      expect(fetchAccountsSearch).toHaveBeenCalledWith(
        'token-123',
        { q: '', filters: expect.objectContaining({ tiers: ['A'] }) },
        expect.any(Object),
      ),
    );
  });

  it('shows an error message when the search fails', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchAccountsSearch).mockResolvedValue({
      accounts: [],
      truncated: false,
    });

    renderView();

    await searchQuery(user, 'INCONNU');

    expect(await screen.findByText('Aucun compte trouvé')).toBeTruthy();
  });

  it('shows that an account with no contacts cannot be selected', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchAccountsSearch).mockResolvedValue({
      accounts: [zeroContactAccount],
      truncated: false,
    });

    renderView();

    await searchQuery(user, 'Wayne');
    await screen.findByText('Wayne Enterprises');

    const checkbox = screen.getByRole('checkbox', {
      name: 'Sélectionner Wayne Enterprises',
    }) as HTMLInputElement;
    expect(checkbox.disabled).toBe(true);
    expect(screen.getByText('0 contact (exclu)')).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: /Créer .* séance/ }),
    ).toBeNull();
  });

  it('does not show the packing panel until at least one account is selected', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchAccountsSearch).mockResolvedValue({
      accounts: [acme],
      truncated: false,
    });

    renderView();

    await searchQuery(user, 'ACME');
    await screen.findByText('ACME');

    expect(screen.queryByText('Découpage en séances')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Continuer vers Composer →' }),
    ).toHaveProperty('disabled', true);
  });

  it('lets the user select readable owner names while sending Salesforce IDs', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchAccountsSearch).mockResolvedValue({
      accounts: [acme],
      truncated: false,
    });
    renderView();

    await chooseFiltersSearch(user);
    await user.click(screen.getByRole('button', { name: 'Paul Martin' }));
    await searchQuery(user, 'ACME');

    await waitFor(() =>
      expect(fetchAccountsSearch).toHaveBeenCalledWith(
        'token-123',
        {
          q: 'ACME',
          filters: expect.objectContaining({
            proprietaires: ['005000000000001AAA'],
          }),
        },
        expect.any(Object),
      ),
    );
    expect(screen.queryByLabelText(/IDs Salesforce/)).toBeNull();
  });

  it('shows the estimation banner with the search total even without any selection', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchAccountsSearch).mockResolvedValue({
      accounts: [acme, acmeSubsidiary],
      truncated: false,
    });
    renderView();

    await searchQuery(user, 'ACME');
    await screen.findByText('ACME');

    expect(
      screen.getByText('2 comptes trouvés · 3 contacts au total'),
    ).toBeTruthy();
  });

  it('uses the explicit session name as namePrefix, falling back to the query', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchAccountsSearch).mockResolvedValue({
      accounts: [acme],
      truncated: false,
    });
    const { onCreateAudience } = renderView();

    await searchQuery(user, 'ACME');
    await screen.findByText('ACME');

    await user.click(
      screen.getByRole('checkbox', { name: 'Sélectionner ACME' }),
    );
    await goToComposer(user);
    await goToPlanifier(user);
    await user.type(
      screen.getByLabelText('Nom des séances (préfixe)'),
      'ACME décisionnaires DAF',
    );
    await user.click(
      screen.getByRole('button', { name: 'Créer 1 séance ABM' }),
    );

    expect(onCreateAudience).toHaveBeenCalledWith(
      expect.objectContaining({ namePrefix: 'ACME décisionnaires DAF' }),
    );
  });

  it('includes the selected future date in the ABM creation payload', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchAccountsSearch).mockResolvedValue({
      accounts: [acme],
      truncated: false,
    });
    const { onCreateAudience } = renderView();

    await searchQuery(user, 'ACME');
    await screen.findByText('ACME');
    await user.click(
      screen.getByRole('checkbox', { name: 'Sélectionner ACME' }),
    );
    await goToComposer(user);
    await goToPlanifier(user);

    const scheduledFor = tomorrowParisIso();
    await user.click(screen.getByLabelText('Date de la séance'));
    if (scheduledFor.slice(0, 7) !== todayParisIso().slice(0, 7)) {
      await user.click(screen.getByRole('button', { name: 'Mois suivant' }));
    }
    await user.click(
      screen.getByRole('button', {
        name: String(Number(scheduledFor.slice(-2))),
      }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Créer 1 séance ABM' }),
    );

    expect(onCreateAudience).toHaveBeenCalledWith(
      expect.objectContaining({ scheduledFor }),
    );
  });

  it('rejects an ABM date that is not in the future', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchAccountsSearch).mockResolvedValue({
      accounts: [acme],
      truncated: false,
    });
    renderView();

    await searchQuery(user, 'ACME');
    await screen.findByText('ACME');
    await user.click(
      screen.getByRole('checkbox', { name: 'Sélectionner ACME' }),
    );
    await goToComposer(user);
    await goToPlanifier(user);
    await user.click(screen.getByLabelText('Date de la séance'));
    const todayBtn = screen.getByRole('button', {
      name: "Aujourd'hui",
    }) as HTMLButtonElement;
    expect(todayBtn.disabled).toBe(true);
  });

  it('live preview: debounces rapid filter changes into a single request 300ms later', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(fetchAccountsSearch).mockResolvedValue({
        accounts: [acme],
        truncated: false,
      });
      renderView();

      chooseFiltersSearchSync();
      fireEvent.click(screen.getByRole('button', { name: 'A' }));
      fireEvent.click(screen.getByRole('button', { name: 'B' }));

      // Still within the 300ms window: no request fired yet.
      act(() => {
        vi.advanceTimersByTime(299);
      });
      expect(fetchAccountsSearch).not.toHaveBeenCalled();

      await act(async () => {
        vi.advanceTimersByTime(1);
      });

      expect(fetchAccountsSearch).toHaveBeenCalledTimes(1);
      expect(fetchAccountsSearch).toHaveBeenCalledWith(
        'token-123',
        { q: '', filters: expect.objectContaining({ tiers: ['A', 'B'] }) },
        expect.any(Object),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('live preview: aborts the in-flight request when a filter changes again before it resolves', async () => {
    vi.useFakeTimers();
    try {
      let resolveFirst: (() => void) | undefined;
      vi.mocked(fetchAccountsSearch).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = () =>
              resolve({ accounts: [acme], truncated: false });
          }),
      );
      vi.mocked(fetchAccountsSearch).mockResolvedValueOnce({
        accounts: [acmeSubsidiary],
        truncated: false,
      });

      renderView();

      chooseFiltersSearchSync();
      fireEvent.click(screen.getByRole('button', { name: 'A' }));
      await act(async () => {
        vi.advanceTimersByTime(300);
      });
      expect(fetchAccountsSearch).toHaveBeenCalledTimes(1);
      const firstSignal =
        vi.mocked(fetchAccountsSearch).mock.calls[0][2]?.signal;

      fireEvent.click(screen.getByRole('button', { name: 'B' }));
      await act(async () => {
        vi.advanceTimersByTime(300);
      });
      expect(fetchAccountsSearch).toHaveBeenCalledTimes(2);
      expect(firstSignal?.aborted).toBe(true);

      resolveFirst?.();
      await act(async () => {
        await Promise.resolve();
      });
      // The stale first response must not overwrite the second one's results.
      expect(screen.queryByText('ACME Europe')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('calls onBack when clicking the Retour button', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    renderView({ onBack });

    await user.click(screen.getByRole('button', { name: 'Retour' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('supports bulk selection: select all, deselect all, and with contacts only', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchAccountsSearch).mockResolvedValue({
      accounts: [acme, acmeSubsidiary, zeroContactAccount],
      truncated: false,
    });
    renderView();

    await searchQuery(user, 'ACME');
    await screen.findByText('ACME');

    // Initialement rien de sélectionné
    expect(
      screen.getByText('3 comptes trouvés · 3 contacts au total'),
    ).toBeTruthy();

    // Tout sélectionner (3 comptes)
    const selectAllBtn = screen.getByRole('button', {
      name: 'Tout sélectionner',
    });
    await user.click(selectAllBtn);
    expect(
      screen.getAllByText(
        (c) => c.includes('3 comptes') && c.includes('3 contacts'),
      )[0],
    ).toBeTruthy();

    // Tout désélectionner
    const deselectAllBtn = screen.getByRole('button', {
      name: 'Tout désélectionner',
    });
    await user.click(deselectAllBtn);
    expect(
      screen.getByText('3 comptes trouvés · 3 contacts au total'),
    ).toBeTruthy();

    // Sélectionner avec contacts uniquement (exclut Wayne Enterprises qui a 0 contacts)
    const withContactsBtn = screen.getByRole('button', {
      name: 'Sélectionner uniquement les comptes avec contacts',
    });
    await user.click(withContactsBtn);
    await goToComposer(user);
    expect(
      screen.getByText(
        (c) => c.includes('2 comptes') && c.includes('3 contacts'),
      ),
    ).toBeTruthy();
  });

  it('sorts accounts by contacts count, name, and tier', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchAccountsSearch).mockResolvedValue({
      accounts: [acme, acmeSubsidiary, zeroContactAccount],
      truncated: false,
    });
    renderView();

    await searchQuery(user, 'ACME');
    await screen.findByText('ACME');

    const selectSortOption = async (label: string) => {
      await user.click(screen.getByRole('button', { name: 'Trier les comptes' }));
      await user.click(screen.getByRole('option', { name: label }));
    };

    // Tri par contacts décroissant: ACME Europe (2), ACME (1), Wayne (0)
    await selectSortOption('Contacts (décroissant)');
    const accountNames = () =>
      within(screen.getByRole('list', { name: 'Comptes trouvés' }))
        .getAllByRole('listitem')
        .map((el) => el.querySelector('strong')?.textContent);
    expect(accountNames()).toEqual([
      'ACME Europe',
      'ACME',
      'Wayne Enterprises',
    ]);

    // Tri par nom décroissant: Wayne, ACME Europe, ACME
    await selectSortOption('Nom (Z → A)');
    expect(accountNames()).toEqual(['Wayne Enterprises', 'ACME Europe', 'ACME']);

    // Tri par nom croissant: ACME, ACME Europe, Wayne
    await selectSortOption('Nom (A → Z)');
    expect(accountNames()).toEqual(['ACME', 'ACME Europe', 'Wayne Enterprises']);

    // Tri par tier prioritaire: ACME (Tier A), ACME Europe (Tier B), Wayne (sans tier)
    await selectSortOption('Tier (prioritaire)');
    expect(accountNames()).toEqual(['ACME', 'ACME Europe', 'Wayne Enterprises']);
  });

  it('persists and restores user preferences in localStorage', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchAccountsSearch).mockResolvedValue({
      accounts: [acme, acmeSubsidiary],
      truncated: false,
    });
    renderView();

    await searchQuery(user, 'ACME');
    await screen.findByText('ACME');

    // Modifier le tri doit sauvegarder dans localStorage
    await user.click(screen.getByRole('button', { name: 'Trier les comptes' }));
    await user.click(screen.getByRole('option', { name: 'Contacts (décroissant)' }));

    expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
      'calls_abm_prefs_v1',
      expect.stringContaining('"sortBy":"contacts-desc"'),
    );
    expect(JSON.parse(localStore['calls_abm_prefs_v1']).sortBy).toBe(
      'contacts-desc',
    );
  });

  it('displays the initial empty state and allows resetting active search and filters', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchAccountsSearch).mockResolvedValue({
      accounts: [acme],
      truncated: false,
    });
    renderView();

    expect(
      screen.getByRole('button', { name: /Rechercher par nom/ }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /Rechercher par filtres/ }),
    ).toBeTruthy();
    expect(screen.queryByLabelText('Nom du compte')).toBeNull();
    expect(screen.queryByText('Commencez votre recherche')).toBeNull();

    await chooseNameSearch(user);
    expect(screen.getByText('Commencez votre recherche')).toBeTruthy();
    expect(screen.queryByText('Cibler des comptes spécifiques')).toBeNull();
    expect(
      screen.queryByText(/Recherchez une entreprise par son nom/),
    ).toBeNull();
    expect(screen.queryByText(/Ou démarrez directement avec/)).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Mes comptes' }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Tier A & B' }),
    ).toBeNull();

    await searchQuery(user, 'ACME');
    await screen.findByText('ACME');
    expect(screen.queryByText('Cibler des comptes spécifiques')).toBeNull();

    // Clic sur Réinitialiser
    await user.click(
      screen.getByRole('button', { name: 'Réinitialiser la recherche' }),
    );
    expect(
      screen.getByRole('button', { name: /Rechercher par nom/ }),
    ).toBeTruthy();
    expect(screen.queryByText('ACME')).toBeNull();
    expect(screen.queryByLabelText('Nom du compte')).toBeNull();
    expect(screen.queryByText('Commencez votre recherche')).toBeNull();
  });

  it('asks for confirmation before resetting when more than 5 accounts are selected', async () => {
    const user = userEvent.setup();
    const sixAccounts = [
      acme,
      acmeSubsidiary,
      zeroContactAccount,
      { ...acme, id: 'acc-3', name: 'Bravo Corp' },
      { ...acme, id: 'acc-4', name: 'Charlie Inc' },
      { ...acme, id: 'acc-5', name: 'Delta LLC' },
    ];
    vi.mocked(fetchAccountsSearch).mockResolvedValue({
      accounts: sixAccounts,
      truncated: false,
    });

    renderView();

    await searchQuery(user, 'ACME');
    await screen.findByText('ACME');

    // Sélectionner les 6 comptes (> 5, seuil de confirmation).
    await user.click(screen.getByRole('button', { name: 'Tout sélectionner' }));

    // Au-dessus du seuil : confirm s'affiche. Annuler préserve la sélection.
    await user.click(
      screen.getByRole('button', { name: 'Réinitialiser la recherche' }),
    );
    expect(screen.getByText(/Réinitialiser la recherche effacera/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(screen.getAllByText('ACME').length).toBeGreaterThanOrEqual(1);

    // Confirmer cette fois : reset effectif.
    await user.click(
      screen.getByRole('button', { name: 'Réinitialiser la recherche' }),
    );
    await user.click(screen.getByRole('button', { name: 'Réinitialiser' }));
  });

  it('renders a loading skeleton while searching', async () => {
    let resolveSearch!: (value: unknown) => void;
    const promise = new Promise((resolve) => {
      resolveSearch = resolve;
    });
    vi.mocked(fetchAccountsSearch).mockReturnValue(promise as never);
    renderView();

    fireEvent.click(
      screen.getByRole('button', { name: /Rechercher par nom/ }),
    );
    fireEvent.change(screen.getByLabelText('Nom du compte'), {
      target: { value: 'ACME' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }));

    expect(screen.getByText('Recherche des comptes en cours…')).toBeTruthy();
    expect(screen.getByRole('status', { busy: true })).toBeTruthy();

    await act(async () => {
      resolveSearch({ accounts: [acme], truncated: false });
    });

    expect(await screen.findByText('ACME')).toBeTruthy();
    expect(screen.queryByText('Recherche des comptes en cours…')).toBeNull();
  });

  it('filters by sector using the PicklistMultiSelect popover with search and removes via active chips', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchAccountsSearch).mockResolvedValue({
      accounts: [acme],
      truncated: false,
    });
    renderView();

    await chooseFiltersSearch(user);
    // Search within PicklistMultiSelect
    const searchInput = screen.getByPlaceholderText('Filtrer les secteurs…');
    await user.type(searchInput, 'Services informatiques');

    // Click on the checkbox for Services informatiques
    const checkbox = screen.getByRole('checkbox', {
      name: 'Services informatiques',
    });
    await user.click(checkbox);

    // Active chip must appear in the sticky search zone
    const activeChipsRegion = screen.getByRole('region', {
      name: 'Filtres actifs',
    });
    expect(activeChipsRegion).toBeTruthy();
    expect(
      within(activeChipsRegion).getByText('Services informatiques'),
    ).toBeTruthy();

    await waitFor(() =>
      expect(fetchAccountsSearch).toHaveBeenCalledWith(
        'token-123',
        {
          q: '',
          filters: expect.objectContaining({
            secteurs: ['Services informatiques'],
          }),
        },
        expect.any(Object),
      ),
    );

    // Remove via the active chip button
    const removeChipBtn = screen.getByRole('button', {
      name: 'Retirer le secteur Services informatiques',
    });
    await user.click(removeChipBtn);

    expect(screen.queryByRole('region', { name: 'Filtres actifs' })).toBeNull();
  });

  it('uses the classic FilterBuilder visual patterns on step 1', async () => {
    const user = userEvent.setup();
    const { container } = renderView();
    expect(container.querySelector('.calls-abm-search-box')).toBeNull();
    expect(screen.queryByText('Replier')).toBeNull();
    expect(screen.queryByText('Déplier')).toBeNull();

    await chooseFiltersSearch(user);
    expect(container.querySelector('.calls-filterbuilder')).toBeTruthy();
    expect(container.querySelector('.calls-fb-section')).toBeTruthy();
    expect(screen.getByPlaceholderText('Filtrer les secteurs…')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'A' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Paul Martin' })).toBeTruthy();
  });

  it('starts with two search-mode cards and toggles without showing both forms', async () => {
    const user = userEvent.setup();
    renderView();

    expect(
      screen.getByRole('button', { name: /Rechercher par nom/ }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /Rechercher par filtres/ }),
    ).toBeTruthy();
    expect(screen.queryByLabelText('Nom du compte')).toBeNull();
    expect(screen.queryByPlaceholderText('Filtrer les secteurs…')).toBeNull();
    expect(screen.queryByText('Replier')).toBeNull();
    expect(screen.queryByText('Déplier')).toBeNull();

    await user.click(
      screen.getByRole('button', { name: /Rechercher par nom/ }),
    );
    expect(screen.getByLabelText('Nom du compte')).toBeTruthy();
    expect(screen.queryByPlaceholderText('Filtrer les secteurs…')).toBeNull();

    await user.click(
      screen.getByRole('button', { name: /Rechercher par filtres/ }),
    );
    expect(screen.queryByLabelText('Nom du compte')).toBeNull();
    expect(screen.getByPlaceholderText('Filtrer les secteurs…')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /Rechercher par nom/ }),
    ).toBeTruthy();
  });

  it('allows clearing all active filters with Tout effacer button in active chips', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchAccountsSearch).mockResolvedValue({
      accounts: [acme],
      truncated: false,
    });
    renderView();

    await chooseFiltersSearch(user);
    await user.click(screen.getByRole('button', { name: 'A' }));
    expect(screen.getByRole('region', { name: 'Filtres actifs' })).toBeTruthy();
    expect(screen.getByText('Tier A')).toBeTruthy();

    // Click "Tout effacer" in the active chips row
    const clearAllChipsBtn = screen.getByRole('button', {
      name: 'Tout effacer les filtres',
    });
    await user.click(clearAllChipsBtn);

    expect(screen.queryByRole('region', { name: 'Filtres actifs' })).toBeNull();
  });
  it('(1) selection survives filter changes', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchAccountsSearch).mockResolvedValueOnce({
      accounts: [acme],
      truncated: false,
    });
    renderView();

    await searchQuery(user, 'ACME');
    await screen.findByText('ACME');

    // Add ACME to target
    await user.click(screen.getByRole('checkbox', { name: 'Sélectionner ACME' }));

    // Now change a filter
    vi.mocked(fetchAccountsSearch).mockResolvedValueOnce({
      accounts: [acmeSubsidiary],
      truncated: false,
    });
    await chooseFiltersSearch(user);
    await user.click(screen.getByRole('button', { name: 'B' }));

    // Target remains completely intact (découplée de la recherche)
    await goToComposer(user);
    expect(
      screen.getByText(/1 compte · 1 contact retenu/),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Retirer ACME de la cible' }),
    ).toBeTruthy();
  });

  it('(2) contact sub-selection propagates to onCreateAudience payload', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchAccountsSearch).mockResolvedValue({
      accounts: [acmeSubsidiary],
      truncated: false,
    });
    const { onCreateAudience } = renderView();

    await searchQuery(user, 'ACME Europe');
    await screen.findByText('ACME Europe');

    // Select ACME Europe (initially 2 contacts)
    await user.click(
      screen.getByRole('checkbox', { name: 'Sélectionner ACME Europe' }),
    );
    await goToComposer(user);
    expect(
      screen.getByText(/1 compte · 2 contacts retenus/),
    ).toBeTruthy();

    // In TargetPanel, uncheck Alice Martin
    const aliceCheckbox = screen.getByRole('checkbox', {
      name: 'Retenir Alice Martin',
    });
    await user.click(aliceCheckbox);

    // Summary updates to 1 contact
    expect(
      screen.getByText(/1 compte · 1 contact retenu/),
    ).toBeTruthy();

    // Create session from Planifier (CTA unique du récap)
    await goToPlanifier(user);
    await user.click(screen.getByRole('button', { name: 'Créer 1 séance ABM' }));

    // Verify payload only contains Jean Petit, NOT Alice Martin
    expect(onCreateAudience).toHaveBeenCalledWith(
      expect.objectContaining({
        groups: [
          expect.objectContaining({
            account_ids: ['001000000000002AAA'],
            contacts: [
              expect.objectContaining({
                contact_name: 'Jean Petit',
              }),
            ],
          }),
        ],
      }),
    );
    const sentContacts =
      vi.mocked(onCreateAudience).mock.calls[0][0].groups[0].contacts;
    expect(sentContacts).toHaveLength(1);
    expect(sentContacts[0].contact_name).toBe('Jean Petit');
  });

  it('(3) asks for confirmation before clearing target with Vider la cible', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchAccountsSearch).mockResolvedValue({
      accounts: [acme],
      truncated: false,
    });
    renderView();

    await searchQuery(user, 'ACME');
    await screen.findByText('ACME');

    // Select ACME
    await user.click(screen.getByRole('checkbox', { name: 'Sélectionner ACME' }));
    await goToComposer(user);
    expect(
      screen.getByText(/1 compte · 1 contact retenu/),
    ).toBeTruthy();

    // Click "Vider" in TargetPanel
    await user.click(screen.getByRole('button', { name: 'Vider la cible' }));
    expect(
      screen.getByText(/Êtes-vous sûr de vouloir vider la cible/),
    ).toBeTruthy();

    // Cancel: target intact
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(
      screen.getAllByText(/1 compte · 1 contact retenu/).length,
    ).toBeGreaterThanOrEqual(1);

    // Confirm: target cleared
    await user.click(screen.getByRole('button', { name: 'Vider la cible' }));
    const confirmBtns = screen.getAllByRole('button', { name: 'Vider la cible' });
    await user.click(confirmBtns[confirmBtns.length - 1]);
    expect(screen.queryAllByText(/1 compte · 1 contact retenu/)).toHaveLength(0);
  });
});

describe('AccountSearchView — wizard 3 étapes', () => {
  it('shows contextual titles, an explicit back button, and no session badge', () => {
    renderView();
    expect(
      screen.getByRole('heading', { name: 'Définissez votre cible' }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retour' })).toBeTruthy();
    expect(screen.queryByText('Nouvelle séance')).toBeNull();
    expect(screen.queryByText('Mode ABM')).toBeNull();
  });

  it('keeps a single primary CTA in the persistent recap sidebar', () => {
    renderView();
    expect(
      screen.getAllByRole('button', { name: 'Continuer vers Composer →' }),
    ).toHaveLength(1);
    expect(screen.getByText('Votre sélection')).toBeTruthy();
  });

  it('blocks Composer and Planifier until at least one contact is retained', () => {
    renderView();
    expect(
      screen.getByRole('button', { name: 'Continuer vers Composer →' }),
    ).toHaveProperty('disabled', true);
    expect(
      screen.getByRole('button', { name: /Étape 2: Composer/ }),
    ).toHaveProperty('disabled', true);
    expect(
      screen.getByRole('button', { name: /Étape 3: Planifier/ }),
    ).toHaveProperty('disabled', true);
  });

  it('preserves targetList and plan fields when navigating back and forth', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchAccountsSearch).mockResolvedValue({
      accounts: [acmeSubsidiary],
      truncated: false,
    });
    renderView();

    await searchQuery(user, 'ACME Europe');
    await screen.findByText('ACME Europe');
    await user.click(
      screen.getByRole('checkbox', { name: 'Sélectionner ACME Europe' }),
    );

    await goToComposer(user);
    expect(
      screen.getByRole('heading', { name: 'Composez votre liste' }),
    ).toBeTruthy();
    await user.click(
      screen.getByRole('checkbox', { name: 'Retenir Alice Martin' }),
    );
    expect(screen.getByText(/1 compte · 1 contact retenu/)).toBeTruthy();

    await goToPlanifier(user);
    expect(
      screen.getByRole('heading', { name: 'Planifiez votre séance' }),
    ).toBeTruthy();
    await user.type(
      screen.getByLabelText('Nom des séances (préfixe)'),
      'Comité DAF',
    );

    await user.click(
      screen.getByRole('button', { name: /Étape 1: Cibler/ }),
    );
    expect(
      screen.getByRole('heading', { name: 'Définissez votre cible' }),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole('checkbox', {
          name: 'Sélectionner ACME Europe',
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);

    await user.click(
      screen.getByRole('button', { name: /Étape 2: Composer/ }),
    );
    expect(
      (
        screen.getByRole('checkbox', {
          name: 'Retenir Alice Martin',
        }) as HTMLInputElement
      ).checked,
    ).toBe(false);
    expect(
      (
        screen.getByRole('checkbox', {
          name: 'Retenir Jean Petit',
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);

    await user.click(
      screen.getByRole('button', { name: /Étape 3: Planifier/ }),
    );
    expect(
      (screen.getByLabelText('Nom des séances (préfixe)') as HTMLInputElement)
        .value,
    ).toBe('Comité DAF');
  });

  it('alerts on dropped accounts after bin-packing overflow', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchAccountsSearch).mockResolvedValue({
      accounts: [acme, acmeSubsidiary],
      truncated: false,
    });
    renderView();

    await searchQuery(user, 'ACME');
    await screen.findByText('ACME');
    await user.click(
      screen.getByRole('checkbox', { name: 'Sélectionner ACME' }),
    );
    await user.click(
      screen.getByRole('checkbox', { name: 'Sélectionner ACME Europe' }),
    );
    await goToComposer(user);
    await goToPlanifier(user);

    fireEvent.change(screen.getByLabelText('Contacts par séance'), {
      target: { value: '1' },
    });
    fireEvent.change(screen.getByLabelText('Nombre max de séances'), {
      target: { value: '1' },
    });

    expect(screen.getByRole('alert').textContent).toMatch(/écarté/);
    expect(screen.getByText('Comptes écartés')).toBeTruthy();
  });
});
