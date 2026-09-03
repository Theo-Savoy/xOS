import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, GlassCard, Skeleton, Tag } from '../../components/ui';
import {
  EFFECTIF_TRANCHES,
  SECTEUR_FAMILIES,
  SECTEUR_VALUES,
  TIER_VALUES,
  TYPE_CLIENT_VALUES,
  type EffectifTranche,
  type Secteur,
  type Tier,
  type TypeClient,
} from '../../crm';
import {
  fetchAccountsSearch,
  CallsApiError,
  type AudienceSessionGroup,
} from './api';
import { packAccountsIntoSessions } from './audienceBinPacking';
import { ChipGroup, PicklistMultiSelect } from './filterControls';
import { asOptions } from './filterControls.helpers';
import { DatePicker } from './formControls';
import { todayParisIso } from './formControls.helpers';
import type { AccountSearchHit, ContactPreview, TeamMember } from './types';

export type AbmSortOption =
  | 'default'
  | 'name-asc'
  | 'name-desc'
  | 'contacts-desc'
  | 'contacts-asc'
  | 'tier-asc';

const ABM_PREFS_KEY = 'calls_abm_prefs_v1';

type AbmPreferences = {
  sortBy?: AbmSortOption;
  filtersOpen?: boolean;
  targetSize?: number;
  maxSessions?: number;
};

function readPreferences(): AbmPreferences {
  try {
    const raw = window.localStorage?.getItem(ABM_PREFS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as AbmPreferences;
  } catch {
    return {};
  }
}

function writePreferences(patch: Partial<AbmPreferences>): void {
  try {
    const current = readPreferences();
    window.localStorage?.setItem(
      ABM_PREFS_KEY,
      JSON.stringify({ ...current, ...patch }),
    );
  } catch {
    // Ignore storage quota or access errors
  }
}

type AbmFilters = {
  secteurs: Secteur[];
  effectifs: EffectifTranche[];
  type_client: TypeClient[];
  tiers: Tier[];
  proprietaires: string[];
};

function emptyAbmFilters(): AbmFilters {
  return {
    secteurs: [],
    effectifs: [],
    type_client: [],
    tiers: [],
    proprietaires: [],
  };
}

function hasAnyFilter(filters: AbmFilters): boolean {
  return (
    filters.secteurs.length > 0 ||
    filters.effectifs.length > 0 ||
    filters.type_client.length > 0 ||
    filters.tiers.length > 0 ||
    filters.proprietaires.length > 0
  );
}

function errorMessage(err: unknown): string {
  if (err instanceof CallsApiError) {
    if (err.code === 'invalid_query')
      return 'Saisissez un nom de compte ou sélectionnez au moins un filtre.';
    if (err.code === 'sf_auth_error')
      return "Salesforce a refusé l'authentification — reconnectez-vous.";
    return `Erreur API (${err.code})`;
  }
  return 'Une erreur est survenue.';
}

function toContactPreview(
  account: AccountSearchHit,
  contact: AccountSearchHit['contacts'][number],
): ContactPreview {
  return {
    sf_contact_id: contact.sf_contact_id,
    sf_account_id: account.id,
    contact_name: contact.contact_name,
    account_name: account.name,
    phone: contact.phone,
    mobile_phone: contact.mobile_phone,
    email: contact.email,
    title: contact.title,
  };
}

export type CreateAudiencePayload = {
  groups: AudienceSessionGroup[];
  targetSize: number;
  maxSessions: number;
  namePrefix?: string;
  excludedCount: number;
  scheduledFor?: string;
};

type AccountSearchViewProps = {
  token: string;
  team?: TeamMember[];
  onBack: () => void;
  onCreateAudience: (payload: CreateAudiencePayload) => void;
  creating: boolean;
  createError: string | null;
};

export function AccountSearchView({
  token,
  team = [],
  onBack,
  onCreateAudience,
  creating,
  createError,
}: AccountSearchViewProps) {
  const initialPrefs = useRef(readPreferences()).current;
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<AbmFilters>(emptyAbmFilters);
  const [filtersOpen, setFiltersOpen] = useState(
    initialPrefs.filtersOpen ?? false,
  );
  const [sortBy, setSortBy] = useState<AbmSortOption>(
    initialPrefs.sortBy ?? 'default',
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<AccountSearchHit[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [excludedCount, setExcludedCount] = useState(0);
  const [sessionName, setSessionName] = useState('');
  const [scheduledFor, setScheduledFor] = useState('');
  const [dateError, setDateError] = useState<string | null>(null);
  const [targetSize, setTargetSize] = useState(initialPrefs.targetSize ?? 50);
  const [maxSessions, setMaxSessions] = useState(initialPrefs.maxSessions ?? 5);

  const setFilter = (patch: Partial<AbmFilters>) =>
    setFilters((current) => ({ ...current, ...patch }));

  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<number | NodeJS.Timeout | null>(null);
  const skipNextAutoSearch = useRef(true);

  const ownerOptions = useMemo(
    () => [
      ...new Map(
        team
          .filter((member) => member.sf_user_id)
          .map((member) => [
            member.sf_user_id,
            {
              value: member.sf_user_id,
              label: member.label,
            },
          ]),
      ).values(),
    ],
    [team],
  );

  const canSearchWith = (q: string, currentFilters: AbmFilters) =>
    q.trim().length >= 2 || hasAnyFilter(currentFilters);
  const canSearch = canSearchWith(query, filters);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filters.secteurs.length > 0) count += filters.secteurs.length;
    if (filters.effectifs.length > 0) count += filters.effectifs.length;
    if (filters.type_client.length > 0) count += filters.type_client.length;
    if (filters.tiers.length > 0) count += filters.tiers.length;
    if (filters.proprietaires.length > 0) count += filters.proprietaires.length;
    return count;
  }, [filters]);

  const runSearch = async (q: string, currentFilters: AbmFilters) => {
    if (!canSearchWith(q, currentFilters) || !token) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAccountsSearch(
        token,
        { q: q.trim(), filters: currentFilters },
        { signal: controller.signal },
      );
      if (abortRef.current !== controller) return; // superseded by a newer filter change
      setAccounts(data.accounts);
      setTruncated(data.truncated);
      setExcludedCount(data.excluded_count ?? 0);
      setSelectedIds(new Set());
      setSearched(true);
      if (data.accounts.length === 0)
        setError('Aucun compte ne correspond à cette recherche.');
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(errorMessage(err));
      setAccounts([]);
      setExcludedCount(0);
    } finally {
      if (abortRef.current === controller) setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    await runSearch(query, filters);
  };

  const handleResetFilters = () => {
    setFilters(emptyAbmFilters());
  };

  const handleResetAll = () => {
    if (selectedIds.size > 5) {
      const ok = window.confirm(
        `Réinitialiser la recherche effacera aussi ${selectedIds.size} compte${selectedIds.size > 1 ? 's' : ''} sélectionné${selectedIds.size > 1 ? 's' : ''}. Continuer ?`,
      );
      if (!ok) return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    abortRef.current?.abort();
    setQuery('');
    setFilters(emptyAbmFilters());
    setAccounts([]);
    setSelectedIds(new Set());
    setSearched(false);
    setError(null);
    setDateError(null);
  };

  // Live preview: modifier un filtre relance la recherche après 300ms, sans clic "Actualiser" (F.2).
  useEffect(() => {
    if (skipNextAutoSearch.current) {
      skipNextAutoSearch.current = false;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void runSearch(query, filters);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const toggleAccount = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedIds(new Set(accounts.map((account) => account.id)));
  };

  const handleDeselectAll = () => {
    setSelectedIds(new Set());
  };

  const handleSelectWithContacts = () => {
    const withContacts = accounts.filter(
      (account) => account.contacts.length > 0,
    );
    setSelectedIds(new Set(withContacts.map((account) => account.id)));
  };

  const handleSortChange = (newSort: AbmSortOption) => {
    setSortBy(newSort);
    writePreferences({ sortBy: newSort });
  };

  const handleFiltersToggle = (open: boolean) => {
    setFiltersOpen(open);
    writePreferences({ filtersOpen: open });
  };

  const handleTargetSizeChange = (val: number) => {
    const next = Math.max(1, val);
    setTargetSize(next);
    writePreferences({ targetSize: next });
  };

  const handleMaxSessionsChange = (val: number) => {
    const next = Math.max(1, val);
    setMaxSessions(next);
    writePreferences({ maxSessions: next });
  };

  const sortedAccounts = useMemo(() => {
    if (sortBy === 'default') return accounts;
    const list = [...accounts];
    switch (sortBy) {
      case 'name-asc':
        return list.sort((a, b) =>
          a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }),
        );
      case 'name-desc':
        return list.sort((a, b) =>
          b.name.localeCompare(a.name, 'fr', { sensitivity: 'base' }),
        );
      case 'contacts-desc':
        return list.sort(
          (a, b) =>
            b.contacts.length - a.contacts.length ||
            a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }),
        );
      case 'contacts-asc':
        return list.sort(
          (a, b) =>
            a.contacts.length - b.contacts.length ||
            a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }),
        );
      case 'tier-asc':
        return list.sort((a, b) => {
          const tierA = a.tier || 'ZZZ';
          const tierB = b.tier || 'ZZZ';
          return (
            tierA.localeCompare(tierB) ||
            a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' })
          );
        });
      default:
        return accounts;
    }
  }, [accounts, sortBy]);

  const selectedAccounts = useMemo(
    () => accounts.filter((account) => selectedIds.has(account.id)),
    [accounts, selectedIds],
  );

  const selectedContactsCount = useMemo(
    () =>
      selectedAccounts.reduce(
        (total, account) => total + account.contacts.length,
        0,
      ),
    [selectedAccounts],
  );

  const totalContactsCount = useMemo(
    () =>
      accounts.reduce((total, account) => total + account.contacts.length, 0),
    [accounts],
  );

  const packableAccounts = useMemo(
    () =>
      selectedAccounts.map((account) => ({
        id: account.id,
        name: account.name,
        contacts: account.contacts.map((contact) =>
          toContactPreview(account, contact),
        ),
      })),
    [selectedAccounts],
  );

  const groups = useMemo(
    () => packAccountsIntoSessions(packableAccounts, targetSize, maxSessions),
    [packableAccounts, targetSize, maxSessions],
  );

  const handleCreateClick = () => {
    if (groups.length === 0) return;
    if (scheduledFor && scheduledFor <= todayParisIso()) {
      setDateError('Choisissez une date future pour planifier la séance ABM.');
      return;
    }
    setDateError(null);
    onCreateAudience({
      groups: groups.map((group) => ({
        account_ids: group.accountIds,
        contacts: group.contacts,
      })),
      targetSize,
      maxSessions,
      namePrefix: sessionName.trim() || query.trim() || undefined,
      excludedCount,
      scheduledFor: scheduledFor || undefined,
    });
  };

  return (
    <div className="calls-view">
      <header className="calls-view__header calls-view__header--runner">
        <div className="calls-view__nav">
          <Button
            variant="secondary"
            className="calls-view__back"
            onClick={onBack}
          >
            Retour
          </Button>
          <div className="calls-view__titleblock">
            <Tag variant="accent">Mode ABM</Tag>
            <h2>Rechercher des comptes</h2>
          </div>
        </div>
      </header>

      <GlassCard className="calls-filterbuilder">
        <div className="calls-fb-row">
          <label className="calls-field" style={{ flex: 1 }}>
            <span>Nom du compte</span>
            <input
              type="text"
              className="calls-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void handleSearch()}
              placeholder="ACME (optionnel si des filtres sont sélectionnés)"
            />
          </label>
          <div className="calls-fb-actions">
            <Button
              onClick={() => void handleSearch()}
              disabled={loading || !canSearch}
            >
              {loading ? 'Recherche…' : 'Rechercher'}
            </Button>
            {(query.trim() || hasAnyFilter(filters)) && (
              <Button
                variant="secondary"
                onClick={handleResetAll}
                disabled={loading}
                aria-label="Réinitialiser la recherche"
              >
                Réinitialiser
              </Button>
            )}
          </div>
        </div>

        <details
          className="calls-fb-section"
          open={filtersOpen}
          onToggle={(e) => handleFiltersToggle(e.currentTarget.open)}
        >
          <summary>
            <span className="calls-fb-section__title">
              Filtres entreprise
              {activeFiltersCount > 0 && (
                <span
                  className="calls-fb-section__badge"
                  aria-label={`${activeFiltersCount} filtre${activeFiltersCount > 1 ? 's' : ''} actif${activeFiltersCount > 1 ? 's' : ''}`}
                >
                  {activeFiltersCount}
                </span>
              )}
            </span>
          </summary>
          <div className="calls-fb-section__body">
            {activeFiltersCount > 0 && (
              <div className="calls-abm-filters-header">
                <span className="calls-muted" style={{ fontSize: '0.82rem' }}>
                  {activeFiltersCount} critère
                  {activeFiltersCount > 1 ? 's' : ''} sélectionné
                  {activeFiltersCount > 1 ? 's' : ''}
                </span>
                <Button
                  variant="secondary"
                  onClick={handleResetFilters}
                  aria-label="Effacer les filtres"
                >
                  Effacer les filtres
                </Button>
              </div>
            )}
            <PicklistMultiSelect
              label="Secteurs d'activité"
              options={asOptions(SECTEUR_VALUES)}
              groups={SECTEUR_FAMILIES.map((family) => ({
                id: family.id,
                label: family.label,
                values: family.secteurs,
              }))}
              value={filters.secteurs}
              onChange={(secteurs) => setFilter({ secteurs })}
              searchPlaceholder="Filtrer les secteurs…"
            />
            <ChipGroup
              label="Effectifs"
              options={asOptions(EFFECTIF_TRANCHES)}
              value={filters.effectifs}
              onChange={(effectifs) => setFilter({ effectifs })}
            />
            <ChipGroup
              label="Type de client"
              options={asOptions(TYPE_CLIENT_VALUES)}
              value={filters.type_client}
              onChange={(type_client) => setFilter({ type_client })}
            />
            <ChipGroup
              label="Tier"
              options={asOptions(TIER_VALUES)}
              value={filters.tiers}
              onChange={(tiers) => setFilter({ tiers })}
            />
            <ChipGroup
              label="Propriétaires du compte"
              hint="Sélectionne par nom"
              options={ownerOptions}
              value={filters.proprietaires}
              onChange={(proprietaires) => setFilter({ proprietaires })}
            />
          </div>
        </details>
      </GlassCard>

      {(error || createError || dateError) && (
        <GlassCard className="calls-error">
          <p role="alert" aria-live="assertive">
            {error || createError || dateError}
          </p>
          {error && canSearch && !loading && (
            <div style={{ marginTop: '0.25rem' }}>
              <Button variant="secondary" onClick={() => void handleSearch()}>
                Réessayer la recherche
              </Button>
            </div>
          )}
        </GlassCard>
      )}

      {truncated && (
        <GlassCard className="calls-truncated-banner" role="status">
          <p>Résultats partiels : affinez votre recherche.</p>
        </GlassCard>
      )}

      {excludedCount > 0 && (
        <div className="calls-builder-excluded-banner" role="status">
          <strong>{excludedCount}</strong> contact{excludedCount > 1 ? 's' : ''}{' '}
          exclu{excludedCount > 1 ? 's' : ''} car déjà dans une séance active.
        </div>
      )}

      {loading && (
        <GlassCard
          className="calls-loading-card"
          role="status"
          aria-busy="true"
          aria-live="polite"
        >
          <div
            style={{
              width: '100%',
              maxWidth: '30rem',
              display: 'grid',
              gap: '0.65rem',
            }}
          >
            <Skeleton height="1.5rem" width="45%" />
            <Skeleton height="1rem" width="85%" />
            <Skeleton height="1rem" width="60%" />
          </div>
          <p className="calls-muted" style={{ margin: 0, fontSize: '0.85rem' }}>
            Recherche des comptes en cours…
          </p>
        </GlassCard>
      )}

      {!loading && !searched && accounts.length === 0 && !error && (
        <GlassCard className="calls-empty calls-empty--hero">
          <Tag variant="accent">Mode ABM</Tag>
          <h3>Cibler des comptes spécifiques</h3>
          <p>
            Recherchez une entreprise par son nom ou combinez les filtres
            d&apos;entreprise pour composer votre sélection.
          </p>
        </GlassCard>
      )}

      {!loading && searched && accounts.length === 0 && !error && (
        <GlassCard className="calls-empty calls-empty--hero">
          <Tag variant="accent">Mode ABM</Tag>
          <h3>Aucun compte trouvé</h3>
          <p>Essayez un autre nom ou ajustez les filtres.</p>
          {(query.trim() || hasAnyFilter(filters)) && (
            <Button variant="secondary" onClick={handleResetAll}>
              Réinitialiser la recherche
            </Button>
          )}
        </GlassCard>
      )}

      {!loading && accounts.length > 0 && (
        <>
          <GlassCard className="calls-name-form calls-name-form--sticky">
            <div className="calls-name-form__meta">
              <Tag>
                {selectedIds.size > 0
                  ? `${selectedContactsCount} contact${selectedContactsCount > 1 ? 's' : ''} dans ${selectedIds.size} compte${selectedIds.size > 1 ? 's' : ''} sélectionné${selectedIds.size > 1 ? 's' : ''}`
                  : `${accounts.length} compte${accounts.length > 1 ? 's' : ''} trouvé${accounts.length > 1 ? 's' : ''} · ${totalContactsCount} contact${totalContactsCount > 1 ? 's' : ''} au total`}
              </Tag>
            </div>
          </GlassCard>

          {selectedIds.size > 0 && (
            <GlassCard className="calls-audience-pack">
              <h3>Découper en plusieurs séances</h3>
              <label className="calls-field">
                <span>Nom des séances (préfixe)</span>
                <input
                  type="text"
                  className="calls-input"
                  value={sessionName}
                  onChange={(e) => setSessionName(e.target.value)}
                  placeholder="Ex: 'ACME décisionnaires' → ACME décisionnaires #1, #2, ..."
                />
              </label>
              <div className="calls-fb-row">
                <DatePicker
                  label="Date de la séance ABM"
                  value={scheduledFor}
                  onChange={(next) => {
                    setScheduledFor(next);
                    setDateError(null);
                  }}
                />
                <label className="calls-field">
                  <span>Taille cible par séance</span>
                  <input
                    type="number"
                    className="calls-input"
                    min={1}
                    value={targetSize}
                    onChange={(e) =>
                      handleTargetSizeChange(Number(e.target.value) || 1)
                    }
                  />
                </label>
                <label className="calls-field">
                  <span>Nombre max de séances</span>
                  <input
                    type="number"
                    className="calls-input"
                    min={1}
                    value={maxSessions}
                    onChange={(e) =>
                      handleMaxSessionsChange(Number(e.target.value) || 1)
                    }
                  />
                </label>
              </div>

              {groups.length > 0 ? (
                <>
                  <p className="calls-muted calls-fb-hint">
                    Aperçu : {groups.length} séance
                    {groups.length > 1 ? 's' : ''}
                  </p>
                  <ul className="calls-audience-pack__preview">
                    {groups.map((group, index) => (
                      <li key={index}>
                        {group.accountNames.join(' + ')} : {group.totalContacts}{' '}
                        contact{group.totalContacts > 1 ? 's' : ''}
                      </li>
                    ))}
                  </ul>
                  <Button onClick={handleCreateClick} disabled={creating}>
                    {creating
                      ? 'Création…'
                      : `Créer ${groups.length} séance${groups.length > 1 ? 's' : ''} ABM`}
                  </Button>
                </>
              ) : (
                <p className="calls-muted calls-fb-hint">
                  Tous les contacts sélectionnés sont déjà en séance active.
                  Aucune séance ne sera créée.
                </p>
              )}
            </GlassCard>
          )}

          <div className="calls-abm-toolbar">
            <div className="calls-abm-actions">
              <Button
                variant="secondary"
                onClick={handleSelectAll}
                disabled={selectedIds.size === accounts.length}
                aria-label="Tout sélectionner"
              >
                Tout sélectionner ({accounts.length})
              </Button>
              <Button
                variant="secondary"
                onClick={handleDeselectAll}
                disabled={selectedIds.size === 0}
                aria-label="Tout désélectionner"
              >
                Tout désélectionner
              </Button>
              {accounts.some((a) => a.contacts.length === 0) &&
                accounts.some((a) => a.contacts.length > 0) && (
                  <Button
                    variant="secondary"
                    onClick={handleSelectWithContacts}
                    aria-label="Sélectionner uniquement les comptes avec contacts"
                  >
                    Avec contacts uniquement
                  </Button>
                )}
            </div>

            <label className="calls-field calls-field--inline">
              <span>Trier par</span>
              <select
                className="calls-select"
                value={sortBy}
                onChange={(e) =>
                  handleSortChange(e.target.value as AbmSortOption)
                }
                aria-label="Trier les comptes"
              >
                <option value="default">Ordre par défaut</option>
                <option value="name-asc">Nom (A → Z)</option>
                <option value="name-desc">Nom (Z → A)</option>
                <option value="contacts-desc">Contacts (décroissant)</option>
                <option value="contacts-asc">Contacts (croissant)</option>
                <option value="tier-asc">Tier (prioritaire)</option>
              </select>
            </label>
          </div>

          <div
            className="calls-preview__table-wrap"
            role="list"
            aria-label="Comptes trouvés"
          >
            {sortedAccounts.map((account) => {
              const checked = selectedIds.has(account.id);
              return (
                <GlassCard
                  key={account.id}
                  className={`calls-preview calls-account-card ${checked ? 'calls-account-card--selected' : ''}`}
                  role="listitem"
                >
                  <div className="calls-preview__header">
                    <label className="calls-checkbox">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleAccount(account.id)}
                        aria-label={`Sélectionner ${account.name}`}
                      />
                      <strong>{account.name}</strong>
                    </label>
                    <div className="calls-preview__actions">
                      {account.tier && <Tag>Tier {account.tier}</Tag>}
                      {account.type_client && <Tag>{account.type_client}</Tag>}
                      {account.effectif && <Tag>{account.effectif}</Tag>}
                      <Tag
                        variant={
                          account.contacts.length > 0 ? 'accent' : 'default'
                        }
                      >
                        {account.contacts.length} contact
                        {account.contacts.length > 1 ? 's' : ''}
                      </Tag>
                    </div>
                  </div>
                  <p className="calls-muted calls-fb-hint">
                    {[account.industry, account.owner_name]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </p>
                </GlassCard>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
