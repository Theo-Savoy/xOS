import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, GlassCard, Modal, Skeleton, Tag } from '../../components/ui';
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
import { ChipGroup } from './filterControls';
import { asOptions } from './filterControls.helpers';
import { FilterableMultiSelect } from './FilterableMultiSelect';
import { DatePicker } from './formControls';
import { tomorrowParisIso } from './formControls.helpers';
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

function AccountCard({
  account,
  checked,
  onToggle,
}: {
  account: AccountSearchHit;
  checked: boolean;
  onToggle: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasContacts = account.contacts.length > 0;

  return (
    <GlassCard
      className={`calls-preview calls-account-card ${checked ? 'calls-account-card--selected' : ''} ${!hasContacts ? 'calls-account-card--disabled' : ''}`}
      role="listitem"
    >
      <div className="calls-preview__header">
        <label className="calls-checkbox" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={checked}
            onChange={onToggle}
            disabled={!hasContacts}
            aria-label={`Sélectionner ${account.name}`}
          />
          <strong>{account.name}</strong>
        </label>
        <div className="calls-preview__actions">
          {account.tier && <Tag>Tier {account.tier}</Tag>}
          {account.type_client && <Tag>{account.type_client}</Tag>}
          {account.effectif && <Tag>{account.effectif}</Tag>}
          {hasContacts ? (
            <Tag variant={checked ? 'accent' : 'default'}>
              {account.contacts.length} contact
              {account.contacts.length > 1 ? 's' : ''}
            </Tag>
          ) : (
            <Tag
              variant="warning"
              title="Aucun contact disponible — exclusion automatique"
            >
              0 contact (exclu)
            </Tag>
          )}
          {hasContacts && (
            <Button
              variant="ghost"
              size="sm"
              className="calls-expand-btn"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(!expanded);
              }}
              aria-expanded={expanded}
              aria-label={
                expanded ? 'Masquer les contacts' : 'Afficher les contacts'
              }
            >
              {expanded ? '▲' : '▼'}
            </Button>
          )}
        </div>
      </div>
      <p className="calls-muted calls-fb-hint calls-mt-1">
        {[account.industry, account.owner_name].filter(Boolean).join(' · ') ||
          '—'}
      </p>
      {expanded && hasContacts && (
        <ul className="calls-account-contacts">
          {account.contacts.map((contact) => (
            <li
              key={contact.sf_contact_id}
              className="calls-account-contact-item"
            >
              <div className="calls-account-contact-item__main">
                <strong>{contact.contact_name}</strong>
                {contact.title && (
                  <span className="calls-muted"> · {contact.title}</span>
                )}
              </div>
              <div className="calls-account-contact-item__meta">
                {contact.decision_level && <Tag>{contact.decision_level}</Tag>}
                {(contact.phone || contact.mobile_phone) && (
                  <span title="Téléphone disponible">📞</span>
                )}
                {contact.email && <span title="Email disponible">✉️</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  );
}

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
    initialPrefs.filtersOpen ?? true,
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
  const secteurGroups = useMemo(
    () =>
      SECTEUR_FAMILIES.map((fam) => ({
        id: fam.id,
        label: fam.label,
        values: fam.secteurs,
      })),
    [],
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
    if (scheduledFor && scheduledFor < tomorrowParisIso()) {
      return; // Validation prevented by DatePicker min prop, but safety net
    }
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

  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const renderSidebarContent = () => {
    const uniqueAccountsCount = new Set(selectedAccounts.map((a) => a.id)).size;
    return (
      <div className="calls-abm-sidebar-inner">
        <div className="calls-abm-sidebar-header">
          <h3>Sélection</h3>
          <p>
            {uniqueAccountsCount} compte{uniqueAccountsCount > 1 ? 's' : ''} ·{' '}
            {selectedContactsCount} contact
            {selectedContactsCount > 1 ? 's' : ''}
          </p>
        </div>

        <div className="calls-abm-sidebar-section">
          <h3>Découpe</h3>
          <label className="calls-field">
            <span>Nom des séances (préfixe)</span>
            <input
              type="text"
              className="calls-input"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              placeholder="Ex: 'ACME décisionnaires' → #1, #2, ..."
            />
          </label>
          <div className="calls-fb-row">
            <DatePicker
              label="Date de la séance"
              value={scheduledFor}
              onChange={(next) => setScheduledFor(next)}
              min={tomorrowParisIso()}
            />
          </div>
          <div className="calls-fb-row">
            <label className="calls-field">
              <span>Comptes/séance</span>
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
              <span>Max séances</span>
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
        </div>

        <div className="calls-abm-sidebar-section calls-abm-sidebar-preview">
          {groups.length > 0 ? (
            <>
              <p className="calls-muted calls-fb-hint calls-mt-4">
                Aperçu : {groups.length} séance{groups.length > 1 ? 's' : ''}
              </p>
              <ul className="calls-audience-pack__preview">
                {groups.map((group, index) => (
                  <li key={index}>
                    {group.accountNames.join(' + ')} : {group.totalContacts}{' '}
                    contact{group.totalContacts > 1 ? 's' : ''}
                  </li>
                ))}
              </ul>
              <Button
                onClick={() => {
                  handleCreateClick();
                  setMobileDrawerOpen(false);
                }}
                disabled={creating}
                className="calls-abm-sidebar-cta"
              >
                {creating
                  ? 'Création…'
                  : `Créer ${groups.length} séance${groups.length > 1 ? 's' : ''} ABM`}
              </Button>
            </>
          ) : (
            <p className="calls-muted calls-fb-hint calls-mt-4">
              Tous les contacts sélectionnés sont déjà en séance active. Aucune
              séance ne sera créée.
            </p>
          )}
        </div>
      </div>
    );
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

      <div className="calls-abm-layout">
        <div className="calls-abm-layout__main">
          {/* Sticky Search Zone */}
          <div className="calls-abm-sticky-search">
            <div className="calls-abm-search-row">
              <div className="calls-abm-search-input-wrap">
                <span className="calls-abm-search-icon" aria-hidden="true">
                  🔍
                </span>
                <input
                  type="text"
                  className="calls-input calls-abm-search-input"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void handleSearch()}
                  placeholder="ACME (optionnel si des filtres sont sélectionnés)"
                  aria-label="Nom du compte"
                />
                {query && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="calls-abm-search-clear"
                    onClick={() => setQuery('')}
                    aria-label="Effacer la recherche"
                  >
                    ×
                  </Button>
                )}
              </div>
              <div className="calls-abm-search-actions">
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

            {/* Active Filter Chips */}
            {hasAnyFilter(filters) && (
              <div
                className="calls-abm-active-chips"
                role="region"
                aria-label="Filtres actifs"
              >
                {filters.secteurs.map((secteur) => (
                  <Tag
                    key={secteur}
                    variant="accent"
                    className="calls-abm-active-chip"
                  >
                    <span>{secteur}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setFilter({
                          secteurs: filters.secteurs.filter(
                            (s) => s !== secteur,
                          ),
                        })
                      }
                      aria-label={`Retirer le secteur ${secteur}`}
                      className="calls-abm-active-chip__remove"
                    >
                      ×
                    </Button>
                  </Tag>
                ))}
                {filters.effectifs.map((eff) => (
                  <Tag
                    key={eff}
                    variant="accent"
                    className="calls-abm-active-chip"
                  >
                    <span>Eff: {eff}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setFilter({
                          effectifs: filters.effectifs.filter((e) => e !== eff),
                        })
                      }
                      aria-label={`Retirer l'effectif ${eff}`}
                      className="calls-abm-active-chip__remove"
                    >
                      ×
                    </Button>
                  </Tag>
                ))}
                {filters.type_client.map((tc) => (
                  <Tag
                    key={tc}
                    variant="accent"
                    className="calls-abm-active-chip"
                  >
                    <span>{tc}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setFilter({
                          type_client: filters.type_client.filter(
                            (t) => t !== tc,
                          ),
                        })
                      }
                      aria-label={`Retirer le type ${tc}`}
                      className="calls-abm-active-chip__remove"
                    >
                      ×
                    </Button>
                  </Tag>
                ))}
                {filters.tiers.map((tier) => (
                  <Tag
                    key={tier}
                    variant="accent"
                    className="calls-abm-active-chip"
                  >
                    <span>Tier {tier}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setFilter({
                          tiers: filters.tiers.filter((t) => t !== tier),
                        })
                      }
                      aria-label={`Retirer le tier ${tier}`}
                      className="calls-abm-active-chip__remove"
                    >
                      ×
                    </Button>
                  </Tag>
                ))}
                {filters.proprietaires.map((p) => {
                  const label =
                    ownerOptions.find((o) => o.value === p)?.label || p;
                  return (
                    <Tag
                      key={p}
                      variant="accent"
                      className="calls-abm-active-chip"
                    >
                      <span>{label}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setFilter({
                            proprietaires: filters.proprietaires.filter(
                              (o) => o !== p,
                            ),
                          })
                        }
                        aria-label={`Retirer le propriétaire ${label}`}
                        className="calls-abm-active-chip__remove"
                      >
                        ×
                      </Button>
                    </Tag>
                  );
                })}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleResetFilters}
                  className="calls-abm-active-chips__clear"
                  aria-label="Tout effacer les filtres"
                >
                  Tout effacer
                </Button>
              </div>
            )}
          </div>

          {/* Filters Section */}
          <details
            className="calls-fb-section calls-abm-filters-card"
            open={filtersOpen}
            onToggle={(e) => handleFiltersToggle(e.currentTarget.open)}
          >
            <summary className="calls-abm-filters-card__header">
              <span className="calls-fb-section__title calls-abm-filters-card__title">
                Filtres entreprise
                {activeFiltersCount > 0 && (
                  <span
                    className="calls-fb-section__badge calls-abm-filters-card__badge"
                    aria-label={`${activeFiltersCount} filtre${activeFiltersCount > 1 ? 's' : ''} actif${activeFiltersCount > 1 ? 's' : ''}`}
                  >
                    {activeFiltersCount}
                  </span>
                )}
              </span>
              <div className="calls-abm-filters-header-actions">
                {activeFiltersCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.preventDefault();
                      handleResetFilters();
                    }}
                    aria-label="Effacer les filtres"
                  >
                    Effacer les filtres
                  </Button>
                )}
                <span className="calls-text-sm calls-muted">
                  {filtersOpen ? 'Replier' : 'Déplier'}
                </span>
              </div>
            </summary>
            <div className="calls-fb-section__body calls-abm-filters-card__body">
              <div className="calls-abm-filter-row">
                <span className="calls-abm-filter-row__label">
                  Secteurs d&apos;activité
                </span>
                <FilterableMultiSelect
                  label="Secteurs d'activité"
                  options={asOptions(SECTEUR_VALUES)}
                  groups={secteurGroups}
                  value={filters.secteurs}
                  onChange={(secteurs) => setFilter({ secteurs })}
                  searchPlaceholder="Rechercher parmi 50+ secteurs…"
                />
              </div>
              <div className="calls-abm-filter-row">
                <ChipGroup
                  label="Effectifs"
                  options={asOptions(EFFECTIF_TRANCHES)}
                  value={filters.effectifs}
                  onChange={(effectifs) => setFilter({ effectifs })}
                />
              </div>
              <div className="calls-abm-filter-row">
                <ChipGroup
                  label="Type de client"
                  options={asOptions(TYPE_CLIENT_VALUES)}
                  value={filters.type_client}
                  onChange={(type_client) => setFilter({ type_client })}
                />
              </div>
              <div className="calls-abm-filter-row">
                <ChipGroup
                  label="Tier"
                  options={asOptions(TIER_VALUES)}
                  value={filters.tiers}
                  onChange={(tiers) => setFilter({ tiers })}
                />
              </div>
              {ownerOptions.length > 0 && (
                <div className="calls-abm-filter-row">
                  <ChipGroup
                    label="Propriétaires du compte"
                    hint="Sélectionne par nom"
                    options={ownerOptions}
                    value={filters.proprietaires}
                    onChange={(proprietaires) => setFilter({ proprietaires })}
                  />
                </div>
              )}
            </div>
          </details>

          {(error || createError) && (
            <GlassCard className="calls-error">
              <p role="alert" aria-live="assertive">
                {error || createError}
              </p>
              {error && canSearch && !loading && (
                <div className="calls-mt-1">
                  <Button
                    variant="secondary"
                    onClick={() => void handleSearch()}
                  >
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
              <strong>{excludedCount}</strong> contact
              {excludedCount > 1 ? 's' : ''} exclu{excludedCount > 1 ? 's' : ''}{' '}
              car déjà dans une séance active.
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
              <p className="calls-muted calls-skeleton-text">
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
                    {accounts.length} compte{accounts.length > 1 ? 's' : ''}{' '}
                    trouvé{accounts.length > 1 ? 's' : ''} ·{' '}
                    {totalContactsCount} contact
                    {totalContactsCount > 1 ? 's' : ''} au total
                  </Tag>
                </div>
              </GlassCard>

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
                    <option value="contacts-desc">
                      Contacts (décroissant)
                    </option>
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
                    <AccountCard
                      key={account.id}
                      account={account}
                      checked={checked}
                      onToggle={() => toggleAccount(account.id)}
                    />
                  );
                })}
              </div>
            </>
          )}
        </div>

        {selectedIds.size > 0 && !loading && (
          <>
            <aside className="calls-abm-sidebar">
              <GlassCard>{renderSidebarContent()}</GlassCard>
            </aside>

            <div className="calls-abm-bottom-bar">
              <div className="calls-abm-bottom-bar-summary">
                <strong>
                  {new Set(selectedAccounts.map((a) => a.id)).size} comptes
                </strong>{' '}
                · {selectedContactsCount} contacts
              </div>
              <Button onClick={() => setMobileDrawerOpen(true)}>
                Configurer et créer ▸
              </Button>
            </div>
          </>
        )}
      </div>

      <Modal
        open={mobileDrawerOpen}
        onClose={() => setMobileDrawerOpen(false)}
        title="Créer des séances ABM"
        variant="glass"
      >
        {renderSidebarContent()}
      </Modal>
    </div>
  );
}
