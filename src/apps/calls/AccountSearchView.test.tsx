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
import { FilterableMultiSelect } from './FilterableMultiSelect';
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

describe('AccountSearchView', () => {
  it('searches, renders grouped account cards, previews the FFD packing, and creates audience sessions', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchAccountsSearch).mockResolvedValue({
      accounts: [acme, acmeSubsidiary],
      truncated: false,
    });
    const { onCreateAudience } = renderView();

    await user.type(screen.getByLabelText('Nom du compte'), 'ACME');
    await user.click(screen.getByRole('button', { name: 'Rechercher' }));

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
    expect(
      screen.getAllByText(
        (c) => c.includes('1 compte') && c.includes('1 contact'),
      )[0],
    ).toBeTruthy();

    await user.click(
      screen.getByRole('checkbox', { name: 'Sélectionner ACME Europe' }),
    );
    expect(
      screen.getAllByText(
        (c) => c.includes('2 comptes') && c.includes('3 contacts'),
      )[0],
    ).toBeTruthy();

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

    const searchButton = screen.getByRole('button', {
      name: 'Rechercher',
    }) as HTMLButtonElement;
    expect(searchButton.disabled).toBe(true);

    await user.click(screen.getByText('Filtres entreprise'));
    await user.click(screen.getByRole('button', { name: 'A' }));

    expect(searchButton.disabled).toBe(false);
    await user.click(searchButton);

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

    await user.type(screen.getByLabelText('Nom du compte'), 'INCONNU');
    await user.click(screen.getByRole('button', { name: 'Rechercher' }));

    expect(await screen.findByText('Aucun compte trouvé')).toBeTruthy();
  });

  it('shows that an account with no contacts cannot be selected', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchAccountsSearch).mockResolvedValue({
      accounts: [zeroContactAccount],
      truncated: false,
    });

    renderView();

    await user.type(screen.getByLabelText('Nom du compte'), 'Wayne');
    await user.click(screen.getByRole('button', { name: 'Rechercher' }));
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

    await user.type(screen.getByLabelText('Nom du compte'), 'ACME');
    await user.click(screen.getByRole('button', { name: 'Rechercher' }));
    await screen.findByText('ACME');

    expect(screen.queryByText('Découper en plusieurs séances')).toBeNull();
  });

  it('lets the user select readable owner names while sending Salesforce IDs', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchAccountsSearch).mockResolvedValue({
      accounts: [acme],
      truncated: false,
    });
    renderView();

    await user.click(screen.getByText('Filtres entreprise'));
    await user.click(screen.getByRole('button', { name: 'Paul Martin' }));
    await user.type(screen.getByLabelText('Nom du compte'), 'ACME');
    await user.click(screen.getByRole('button', { name: 'Rechercher' }));

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

    await user.type(screen.getByLabelText('Nom du compte'), 'ACME');
    await user.click(screen.getByRole('button', { name: 'Rechercher' }));
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

    await user.type(screen.getByLabelText('Nom du compte'), 'ACME');
    await user.click(screen.getByRole('button', { name: 'Rechercher' }));
    await screen.findByText('ACME');

    await user.click(
      screen.getByRole('checkbox', { name: 'Sélectionner ACME' }),
    );
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

    await user.type(screen.getByLabelText('Nom du compte'), 'ACME');
    await user.click(screen.getByRole('button', { name: 'Rechercher' }));
    await screen.findByText('ACME');
    await user.click(
      screen.getByRole('checkbox', { name: 'Sélectionner ACME' }),
    );

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

    await user.type(screen.getByLabelText('Nom du compte'), 'ACME');
    await user.click(screen.getByRole('button', { name: 'Rechercher' }));
    await screen.findByText('ACME');
    await user.click(
      screen.getByRole('checkbox', { name: 'Sélectionner ACME' }),
    );
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

      fireEvent.click(screen.getByText('Filtres entreprise'));
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

      fireEvent.click(screen.getByText('Filtres entreprise'));
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

    await user.type(screen.getByLabelText('Nom du compte'), 'ACME');
    await user.click(screen.getByRole('button', { name: 'Rechercher' }));
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
    expect(
      screen.getAllByText(
        (c) => c.includes('2 comptes') && c.includes('3 contacts'),
      )[0],
    ).toBeTruthy();
  });

  it('sorts accounts by contacts count, name, and tier', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchAccountsSearch).mockResolvedValue({
      accounts: [acme, acmeSubsidiary, zeroContactAccount],
      truncated: false,
    });
    renderView();

    await user.type(screen.getByLabelText('Nom du compte'), 'ACME');
    await user.click(screen.getByRole('button', { name: 'Rechercher' }));
    await screen.findByText('ACME');

    const selectSortOption = async (label: string) => {
      await user.click(screen.getByRole('button', { name: 'Trier les comptes' }));
      await user.click(screen.getByRole('option', { name: label }));
    };

    // Tri par contacts décroissant: ACME Europe (2), ACME (1), Wayne (0)
    await selectSortOption('Contacts (décroissant)');
    const itemsContactsDesc = screen
      .getAllByRole('listitem')
      .map((el) => el.querySelector('strong')?.textContent);
    expect(itemsContactsDesc).toEqual([
      'ACME Europe',
      'ACME',
      'Wayne Enterprises',
    ]);

    // Tri par nom décroissant: Wayne, ACME Europe, ACME
    await selectSortOption('Nom (Z → A)');
    const itemsNameDesc = screen
      .getAllByRole('listitem')
      .map((el) => el.querySelector('strong')?.textContent);
    expect(itemsNameDesc).toEqual(['Wayne Enterprises', 'ACME Europe', 'ACME']);

    // Tri par nom croissant: ACME, ACME Europe, Wayne
    await selectSortOption('Nom (A → Z)');
    const itemsNameAsc = screen
      .getAllByRole('listitem')
      .map((el) => el.querySelector('strong')?.textContent);
    expect(itemsNameAsc).toEqual(['ACME', 'ACME Europe', 'Wayne Enterprises']);

    // Tri par tier prioritaire: ACME (Tier A), ACME Europe (Tier B), Wayne (sans tier)
    await selectSortOption('Tier (prioritaire)');
    const itemsTierAsc = screen
      .getAllByRole('listitem')
      .map((el) => el.querySelector('strong')?.textContent);
    expect(itemsTierAsc).toEqual(['ACME', 'ACME Europe', 'Wayne Enterprises']);
  });

  it('persists and restores user preferences in localStorage', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchAccountsSearch).mockResolvedValue({
      accounts: [acme, acmeSubsidiary],
      truncated: false,
    });
    renderView();

    await user.type(screen.getByLabelText('Nom du compte'), 'ACME');
    await user.click(screen.getByRole('button', { name: 'Rechercher' }));
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

    // État vide initial avant recherche
    expect(screen.getByText('Cibler des comptes spécifiques')).toBeTruthy();

    await user.type(screen.getByLabelText('Nom du compte'), 'ACME');
    await user.click(screen.getByRole('button', { name: 'Rechercher' }));
    await screen.findByText('ACME');
    expect(screen.queryByText('Cibler des comptes spécifiques')).toBeNull();

    // Clic sur Réinitialiser
    await user.click(
      screen.getByRole('button', { name: 'Réinitialiser la recherche' }),
    );
    expect(screen.getByText('Cibler des comptes spécifiques')).toBeTruthy();
    expect(screen.queryByText('ACME')).toBeNull();
    expect(
      (screen.getByLabelText('Nom du compte') as HTMLInputElement).value,
    ).toBe('');
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

    await user.type(screen.getByLabelText('Nom du compte'), 'ACME');
    await user.click(screen.getByRole('button', { name: 'Rechercher' }));
    await screen.findByText('ACME');

    // Sélectionner les 6 comptes (> 5, seuil de confirmation).
    await user.click(screen.getByRole('button', { name: 'Tout sélectionner' }));

    // Au-dessus du seuil : confirm s'affiche. Annuler préserve la sélection.
    await user.click(
      screen.getByRole('button', { name: 'Réinitialiser la recherche' }),
    );
    expect(screen.getByText(/Réinitialiser la recherche effacera/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(screen.getByText('ACME')).toBeTruthy();

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

  it('filters by sector using the FilterableMultiSelect popover with search and removes via active chips', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchAccountsSearch).mockResolvedValue({
      accounts: [acme],
      truncated: false,
    });
    renderView();

    // Open the sector popover
    const sectorTrigger = screen.getByRole('button', {
      name: /Secteurs d'activité/,
    });
    await user.click(sectorTrigger);

    // Search within the popover
    const searchInput = screen.getByPlaceholderText(
      'Rechercher parmi 50+ secteurs…',
    );
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
    // Run search with the selected sector
    const searchButton = screen.getByRole('button', { name: 'Rechercher' });
    await user.click(searchButton);

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

  it('allows clearing search query with the clear button', async () => {
    const user = userEvent.setup();
    renderView();

    const input = screen.getByLabelText('Nom du compte') as HTMLInputElement;
    await user.type(input, 'ACME');
    expect(input.value).toBe('ACME');
    const clearBtn = screen.getByRole('button', {
      name: 'Effacer la recherche',
    });
    await user.click(clearBtn);

    expect(input.value).toBe('');
    expect(
      screen.queryByRole('button', { name: 'Effacer la recherche' }),
    ).toBeNull();
  });

  it('allows clearing all active filters with Tout effacer button in active chips', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchAccountsSearch).mockResolvedValue({
      accounts: [acme],
      truncated: false,
    });
    renderView();

    // Add a Tier filter
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
});

describe('FilterableMultiSelect', () => {
  const sampleOptions = [
    { value: 'opt1', label: 'Option Alpha' },
    { value: 'opt2', label: 'Option Beta' },
    { value: 'opt3', label: 'Option Gamma' },
  ];

  const sampleGroups = [
    { id: 'g1', label: 'Groupe Un', values: ['opt1', 'opt2'] },
    { id: 'g2', label: 'Groupe Deux', values: ['opt3'] },
  ];

  it('renders trigger, opens popover on click, filters options and toggles individual option', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <FilterableMultiSelect
        label="Test Select"
        options={sampleOptions}
        groups={sampleGroups}
        value={['opt1']}
        onChange={onChange}
      />,
    );

    // Trigger shows label and selected count badge
    const trigger = screen.getByRole('button', {
      name: /Test Select/,
    });
    expect(trigger).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();

    // Open popover
    await user.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Test Select' })).toBeTruthy();

    // Filter via search input
    const searchInput = screen.getByRole('searchbox', {
      name: 'Rechercher dans Test Select',
    });
    await user.type(searchInput, 'Beta');
    expect(screen.getByText('Option Beta')).toBeTruthy();
    expect(screen.queryByText('Option Gamma')).toBeNull();

    // Toggle Option Beta
    const betaCheckbox = screen.getByRole('checkbox', {
      name: 'Option Beta',
    });
    await user.click(betaCheckbox);
    expect(onChange).toHaveBeenCalledWith(['opt1', 'opt2']);
  });

  it('selects and deselects entire family group with group header checkbox', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <FilterableMultiSelect
        label="Test Select"
        options={sampleOptions}
        groups={sampleGroups}
        value={['opt1']}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Test Select/ }));

    // Toggle group G1 (contains opt1 and opt2)
    const g1Checkbox = screen.getByRole('checkbox', {
      name: 'Sélectionner toute la catégorie Groupe Un',
    });
    await user.click(g1Checkbox);

    expect(onChange).toHaveBeenCalledWith(['opt1', 'opt2']);
  });

  it('clears all selections via header Effacer button and closes on Escape', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <FilterableMultiSelect
        label="Test Select"
        options={sampleOptions}
        value={['opt1', 'opt2']}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Test Select/ }));
    expect(screen.getByRole('dialog', { name: 'Test Select' })).toBeTruthy();

    // Clear all
    const clearBtn = screen.getByRole('button', { name: 'Tout effacer' });
    await user.click(clearBtn);
    expect(onChange).toHaveBeenCalledWith([]);

    // Press Escape to close
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Test Select' })).toBeNull();
  });
});
