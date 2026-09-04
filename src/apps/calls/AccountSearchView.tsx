import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Button,
  DatePicker,
  EmptyState,
  GlassCard,
  Select,
  type SelectOption,
  Skeleton,
  Tag,
} from '../../components/ui';
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
import { ConfirmDialog } from './ConfirmDialog';
import {
  fetchAccountsSearch,
  CallsApiError,
  type AudienceSessionGroup,
} from './api';
import { packAccountsIntoSessions } from './audienceBinPacking';
import { PicklistMultiSelect, ChipGroup } from './filterControls';
import { asOptions } from './filterControls.helpers';
import { todayParisIso } from './formControls.helpers';
import type { AccountSearchHit, ContactPreview, TeamMember } from './types';
import { AccountRow } from './abm/AccountRow';
import { TargetPanel, type TargetEntry } from './abm/TargetPanel';
import {
  WizardStepper,
  type WizardStep,
} from './modules/sessions/WizardStepper';
import { AbmWizardRecap } from './abm/AbmWizardRecap';

export type AbmSortOption =
  | 'default'
  | 'name-asc'
  | 'name-desc'
  | 'contacts-desc'
  | 'contacts-asc'
  | 'tier-asc';

const SORT_OPTIONS: readonly SelectOption<AbmSortOption>[] = [
  { value: 'default', label: 'Ordre par défaut' },
  { value: 'name-asc', label: 'Nom (A → Z)' },
  { value: 'name-desc', label: 'Nom (Z → A)' },
  { value: 'contacts-desc', label: 'Contacts (décroissant)' },
  { value: 'contacts-asc', label: 'Contacts (croissant)' },
  { value: 'tier-asc', label: 'Tier (prioritaire)' },
];

const STEP_TITLES: Record<WizardStep, string> = {
  0: 'Définissez votre cible',
  1: 'Composez votre liste',
  2: 'Planifiez votre séance',
};

const ABM_PREFS_KEY = 'calls_abm_prefs_v1';
type AbmPreferences = {
  sortBy?: AbmSortOption;
  targetSize?: number;
  maxSessions?: number;
};

function readPrefs(): AbmPreferences {
  try {
    return JSON.parse(window.localStorage?.getItem(ABM_PREFS_KEY) || '{}');
  } catch {
    return {};
  }
}

function writePrefs(patch: Partial<AbmPreferences>): void {
  try {
    window.localStorage?.setItem(
      ABM_PREFS_KEY,
      JSON.stringify({ ...readPrefs(), ...patch }),
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
  compte_principal: string | null;
  compte_principal_name: string | null;
};

const emptyAbmFilters = (): AbmFilters => ({
  secteurs: [],
  effectifs: [],
  type_client: [],
  tiers: [],
  proprietaires: [],
  compte_principal: null,
  compte_principal_name: null,
});

const hasAnyFilter = (f: AbmFilters) =>
  f.secteurs.length > 0 ||
  f.effectifs.length > 0 ||
  f.type_client.length > 0 ||
  f.tiers.length > 0 ||
  f.proprietaires.length > 0 ||
  Boolean(f.compte_principal?.trim()) ||
  Boolean(f.compte_principal_name?.trim());

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

const toContactPreview = (
  account: AccountSearchHit,
  contact: AccountSearchHit['contacts'][number],
): ContactPreview => ({
  sf_contact_id: contact.sf_contact_id,
  sf_account_id: account.id,
  contact_name: contact.contact_name,
  account_name: account.name,
  phone: contact.phone,
  mobile_phone: contact.mobile_phone,
  email: contact.email,
  title: contact.title,
});

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
  initialStep?: WizardStep;
};

function SearchModeIcon(): ReactNode {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3-3" />
    </svg>
  );
}

function FiltersModeIcon(): ReactNode {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

export function AccountSearchView({
  token,
  team = [],
  onBack,
  onCreateAudience,
  creating,
  createError,
  initialStep,
}: AccountSearchViewProps) {
  const [step, setStep] = useState<WizardStep>(initialStep ?? 0);
  const [composerSubStep, setComposerSubStep] = useState<
    'accounts' | 'contacts'
  >('accounts');
  const initialPrefs = useRef(readPrefs()).current;
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<AbmFilters>(emptyAbmFilters);
  const [searchMode, setSearchMode] = useState<'name' | 'filters' | null>(null);
  const [sortBy, setSortBy] = useState<AbmSortOption>(
    initialPrefs.sortBy ?? 'default',
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<AccountSearchHit[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [searched, setSearched] = useState(false);
  const [excludedCount, setExcludedCount] = useState(0);

  // Persistent target list decoupled from search results
  const [targetList, setTargetList] = useState<Map<string, TargetEntry>>(
    new Map(),
  );
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  // Dernier compte retiré depuis le composer (suppression douce) : permet
  // d'adapter le message de l'étape 2 tant que la section « retirés » du
  // TargetPanel peut encore proposer de le remettre.
  const lastRemovedRef = useRef<string | null>(null);
  const [sessionName, setSessionName] = useState('');
  const [scheduledFor, setScheduledFor] = useState('');
  const [targetSize, setTargetSize] = useState(initialPrefs.targetSize ?? 50);
  const [maxSessions, setMaxSessions] = useState(initialPrefs.maxSessions ?? 5);

  useEffect(() => {
    if (initialStep !== undefined) setStep(initialStep);
  }, [initialStep]);

  const setFilter = (patch: Partial<AbmFilters>) =>
    setFilters((c) => ({ ...c, ...patch }));

  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<number | NodeJS.Timeout | null>(null);
  const skipNextAutoSearch = useRef(true);
  const inflightSearchKey = useRef<string | null>(null);
  const lastCompletedSearchKey = useRef<string | null>(null);

  const ownerOptions = useMemo(
    () =>
      team
        .filter((m) => m.sf_user_id)
        .map((m) => ({ value: m.sf_user_id, label: m.label })),
    [team],
  );

  const secteurGroups = useMemo(
    () =>
      SECTEUR_FAMILIES.map((f) => ({
        id: f.id,
        label: f.label,
        values: f.secteurs,
      })),
    [],
  );

  const canSearch = query.trim().length >= 2 || hasAnyFilter(filters);
  const activeFiltersCount = useMemo(
    () =>
      filters.secteurs.length +
      filters.effectifs.length +
      filters.type_client.length +
      filters.tiers.length +
      filters.proprietaires.length +
      (filters.compte_principal?.trim() ? 1 : 0) +
      (filters.compte_principal_name?.trim() ? 1 : 0),
    [filters],
  );

  const activeChips = useMemo(() => {
    const list: { key: keyof AbmFilters; value: string; label: string }[] = [];
    for (const s of filters.secteurs)
      list.push({ key: 'secteurs', value: s, label: s });
    for (const e of filters.effectifs)
      list.push({ key: 'effectifs', value: e, label: e });
    for (const t of filters.type_client)
      list.push({ key: 'type_client', value: t, label: t });
    for (const r of filters.tiers)
      list.push({ key: 'tiers', value: r, label: `Tier ${r}` });
    for (const p of filters.proprietaires) {
      const name = ownerOptions.find((o) => o.value === p)?.label || p;
      list.push({ key: 'proprietaires', value: p, label: name });
    }
    if (filters.compte_principal?.trim()) {
      list.push({
        key: 'compte_principal',
        value: filters.compte_principal,
        label: `Groupe : ${filters.compte_principal}`,
      });
    }
    if (filters.compte_principal_name?.trim()) {
      list.push({
        key: 'compte_principal_name',
        value: filters.compte_principal_name,
        label: `Groupe : ${filters.compte_principal_name}`,
      });
    }
    return list;
  }, [filters, ownerOptions]);

  const removeFilterItem = (key: keyof AbmFilters, value: string) => {
    if (key === 'compte_principal') {
      setFilter({ compte_principal: null });
      return;
    }
    if (key === 'compte_principal_name') {
      setFilter({ compte_principal_name: null });
      return;
    }
    setFilters((prev) => ({
      ...prev,
      [key]: (prev[key] as string[]).filter((item) => item !== value),
    }));
  };

  const searchKeyOf = (q: string, curFilters: AbmFilters) =>
    JSON.stringify({ q: q.trim(), ...curFilters });

  const runSearch = async (q: string, curFilters: AbmFilters) => {
    if (!token || (!hasAnyFilter(curFilters) && q.trim().length < 2)) return;
    const key = searchKeyOf(q, curFilters);
    if (
      key === inflightSearchKey.current ||
      key === lastCompletedSearchKey.current
    ) {
      return;
    }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    inflightSearchKey.current = key;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAccountsSearch(
        token,
        { q: q.trim(), filters: curFilters },
        { signal: ctrl.signal },
      );
      if (abortRef.current !== ctrl) return;
      setAccounts(data.accounts);
      setTruncated(data.truncated);
      setExcludedCount(data.excluded_count ?? 0);
      setSearched(true);
      lastCompletedSearchKey.current = key;
    } catch (err) {
      if (ctrl.signal.aborted) return;
      setError(errorMessage(err));
      setAccounts([]);
      setExcludedCount(0);
    } finally {
      if (abortRef.current === ctrl) {
        inflightSearchKey.current = null;
        setLoading(false);
      }
    }
  };

  const handleSearch = async () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    await runSearch(query, filters);
  };

  const executeResetAll = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    abortRef.current?.abort();
    skipNextAutoSearch.current = true;
    inflightSearchKey.current = null;
    lastCompletedSearchKey.current = null;
    setQuery('');
    setFilters(emptyAbmFilters());
    setSearchMode(null);
    setAccounts([]);
    setTargetList(new Map());
    setSearched(false);
    setError(null);
    setConfirmResetOpen(false);
    setComposerSubStep('accounts');
  };

  const handleResetAll = () => {
    if (targetList.size >= 5) {
      setConfirmResetOpen(true);
      return;
    }
    executeResetAll();
  };

  useEffect(() => {
    if (skipNextAutoSearch.current) {
      skipNextAutoSearch.current = false;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const eligible = query.trim().length >= 2 || hasAnyFilter(filters);
    if (!eligible) return;
    debounceRef.current = setTimeout(() => void runSearch(query, filters), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, filters]);

  const sortAccountList = (list: AccountSearchHit[], sort: AbmSortOption) => {
    if (sort === 'default') return list;
    return [...list].sort((a, b) => {
      if (sort === 'name-asc')
        return a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });
      if (sort === 'name-desc')
        return b.name.localeCompare(a.name, 'fr', { sensitivity: 'base' });
      if (sort === 'contacts-desc')
        return (
          b.contacts.length - a.contacts.length ||
          a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' })
        );
      if (sort === 'contacts-asc')
        return (
          a.contacts.length - b.contacts.length ||
          a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' })
        );
      if (sort === 'tier-asc')
        return (
          (a.tier || 'ZZZ').localeCompare(b.tier || 'ZZZ') ||
          a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' })
        );
      return 0;
    });
  };

  const targetAccounts = useMemo(
    () => Array.from(targetList.values()).map((e) => e.account),
    [targetList],
  );

  const sortedTargetAccounts = useMemo(
    () => sortAccountList(targetAccounts, sortBy),
    [targetAccounts, sortBy],
  );

  const hasActiveSearch = query.trim().length > 0 || hasAnyFilter(filters);

  const searchResults = useMemo(
    () => sortAccountList(accounts, sortBy),
    [accounts, sortBy],
  );

  const displayedAccounts = useMemo(() => {
    if (!hasActiveSearch) return sortedTargetAccounts;
    // Pendant une recherche, les comptes déjà ciblés restent dans la liste à
    // leur place (badge « Ajouté ») au lieu d'être épinglés en tête, ce qui
    // perturbait la lecture des résultats au fil de la frappe.
    return searchResults;
  }, [hasActiveSearch, searchResults, sortedTargetAccounts]);

  const hierarchicalAccounts = useMemo<
    {
      account: AccountSearchHit;
      isSubsidiary: boolean;
      subsidiaries?: AccountSearchHit[];
    }[]
  >(() => {
    const groupIds = new Set(
      displayedAccounts.filter((a) => a.is_group).map((a) => a.id),
    );
    if (groupIds.size === 0) {
      return displayedAccounts.map((a) => ({
        account: a,
        isSubsidiary: false,
      }));
    }

    const subsidiariesByGroup = new Map<string, AccountSearchHit[]>();
    for (const acc of displayedAccounts) {
      if (acc.is_group) continue;
      if (acc.parent_id && groupIds.has(acc.parent_id)) {
        const list = subsidiariesByGroup.get(acc.parent_id) || [];
        list.push(acc);
        subsidiariesByGroup.set(acc.parent_id, list);
      }
    }

    const result: {
      account: AccountSearchHit;
      isSubsidiary: boolean;
      subsidiaries?: AccountSearchHit[];
    }[] = [];

    for (const acc of displayedAccounts) {
      if (acc.is_group) {
        const subs = subsidiariesByGroup.get(acc.id) || [];
        result.push({ account: acc, isSubsidiary: false, subsidiaries: subs });
        for (const sub of subs) {
          result.push({ account: sub, isSubsidiary: true });
        }
      } else if (!acc.parent_id || !groupIds.has(acc.parent_id)) {
        result.push({ account: acc, isSubsidiary: false });
      }
    }
    return result;
  }, [displayedAccounts]);

  const handleToggleGroup = (
    group: AccountSearchHit,
    subsidiaries: AccountSearchHit[],
  ) => {
    const allAccounts = [group, ...subsidiaries].filter(
      (a) => a.contacts.length > 0,
    );
    const allSelected =
      allAccounts.length > 0 && allAccounts.every((a) => targetList.has(a.id));
    setTargetList((prev) => {
      const next = new Map(prev);
      if (allSelected) {
        for (const a of [group, ...subsidiaries]) next.delete(a.id);
      } else {
        for (const a of allAccounts) {
          next.set(a.id, {
            account: a,
            contactIds: new Set(a.contacts.map((c) => c.sf_contact_id)),
          });
        }
      }
      return next;
    });
  };

  const handleToggleTarget = (acc: AccountSearchHit) => {
    if (acc.contacts.length === 0) return;
    setTargetList((prev) => {
      const next = new Map(prev);
      if (next.has(acc.id)) next.delete(acc.id);
      else
        next.set(acc.id, {
          account: acc,
          contactIds: new Set(acc.contacts.map((c) => c.sf_contact_id)),
        });
      return next;
    });
  };

  const handleToggleContact = (accId: string, contactId: string) => {
    setTargetList((prev) => {
      const next = new Map(prev);
      const entry = next.get(accId);
      if (!entry) return prev;
      const nextContacts = new Set(entry.contactIds);
      if (nextContacts.has(contactId)) nextContacts.delete(contactId);
      else nextContacts.add(contactId);
      next.set(accId, { ...entry, contactIds: nextContacts });
      return next;
    });
  };

  const handleSetRetainedContacts = (
    accId: string,
    contactIds: Set<string>,
  ) => {
    setTargetList((prev) => {
      const next = new Map(prev);
      const entry = next.get(accId);
      if (!entry) return prev;
      next.set(accId, { ...entry, contactIds });
      return next;
    });
  };

  const handleSelectAll = () => {
    setTargetList((prev) => {
      const next = new Map(prev);
      for (const a of displayedAccounts) {
        if (a.contacts.length > 0)
          next.set(a.id, {
            account: a,
            contactIds: new Set(a.contacts.map((c) => c.sf_contact_id)),
          });
      }
      return next;
    });
  };

  const handleDeselectAll = () => {
    setTargetList((prev) => {
      const next = new Map(prev);
      for (const a of displayedAccounts) next.delete(a.id);
      return next;
    });
  };

  const totalContactsCount = useMemo(
    () => displayedAccounts.reduce((t, a) => t + a.contacts.length, 0),
    [displayedAccounts],
  );

  const packableAccounts = useMemo(
    () =>
      Array.from(targetList.values())
        .map(({ account, contactIds }) => ({
          id: account.id,
          name: account.name,
          contacts: account.contacts
            .filter((c) => contactIds.has(c.sf_contact_id))
            .map((c) => toContactPreview(account, c)),
        }))
        .filter((a) => a.contacts.length > 0),
    [targetList],
  );

  const packingResult = useMemo(
    () => packAccountsIntoSessions(packableAccounts, targetSize, maxSessions),
    [packableAccounts, targetSize, maxSessions],
  );
  const groups = packingResult;
  const droppedAccounts = packingResult.dropped;

  const totalRetainedInTarget = useMemo(
    () =>
      Array.from(targetList.values()).reduce(
        (sum, e) => sum + e.contactIds.size,
        0,
      ),
    [targetList],
  );

  const canProceedToStep2 =
    query.trim().length >= 2 || hasAnyFilter(filters) || targetList.size > 0;
  const canProceedToStep3 = targetList.size > 0 && totalRetainedInTarget > 0;
  const canLaunchSession =
    groups.length > 0 && (!scheduledFor || scheduledFor >= todayParisIso());

  const handleCreateClick = () => {
    if (!canLaunchSession) return;
    onCreateAudience({
      groups: groups.map((g) => ({
        account_ids: g.accountIds,
        contacts: g.contacts,
      })),
      targetSize,
      maxSessions,
      namePrefix: sessionName.trim() || query.trim() || undefined,
      excludedCount,
      scheduledFor: scheduledFor || undefined,
    });
  };

  const handleStepChange = (next: WizardStep) => {
    if (next === 0) {
      setStep(0);
      return;
    }
    if (next === 1 && canProceedToStep2) {
      if (canSearch && !searched) {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        void runSearch(query, filters);
      }
      setStep(1);
      setComposerSubStep(searchMode === 'name' ? 'contacts' : 'accounts');
      return;
    }
    if (next === 2 && canProceedToStep2 && canProceedToStep3) {
      setStep(2);
    }
  };

  const handleNext = () => {
    if (step === 0 && canProceedToStep2) {
      if (canSearch && !searched) {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        void runSearch(query, filters);
      }
      setStep(1);
      setComposerSubStep(searchMode === 'name' ? 'contacts' : 'accounts');
    } else if (step === 1) {
      if (searchMode === 'name') {
        if (canProceedToStep3) {
          setStep(2);
        }
      } else {
        if (composerSubStep === 'accounts') {
          if (canProceedToStep3) {
            setComposerSubStep('contacts');
          }
        } else if (canProceedToStep3) {
          setStep(2);
        }
      }
    } else if (step === 2 && canLaunchSession) {
      handleCreateClick();
    }
  };

  const renderAccountResults = (showReturnToCibler: boolean) => (
    <section
      className="calls-abm-cibler__results"
      aria-label="Résultats de recherche"
    >
      <div className="calls-abm-cibler__results-head">
        <div className="calls-abm-results-head-left">
          <h3 className="calls-abm-cibler__results-title">
            {showReturnToCibler
              ? 'Comptes ciblés et trouvés'
              : 'Comptes trouvés'}
          </h3>
          {showReturnToCibler && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setStep(0)}
              aria-label="Modifier le ciblage (retour étape 1)"
            >
              ← Modifier le ciblage
            </Button>
          )}
        </div>
        {!loading && displayedAccounts.length > 0 && (
          <div className="calls-abm-results-summary">
            <Tag>
              {displayedAccounts.length} compte
              {displayedAccounts.length > 1 ? 's' : ''} trouvé
              {displayedAccounts.length > 1 ? 's' : ''} · {totalContactsCount}{' '}
              contact
              {totalContactsCount > 1 ? 's' : ''} au total
            </Tag>
          </div>
        )}
      </div>

      {truncated && (
        <GlassCard className="calls-truncated-banner" role="status">
          <p>Limite de résultats atteinte — utilisez des filtres plus précis pour voir tous les comptes.</p>
        </GlassCard>
      )}

      {excludedCount > 0 && (
        <div className="calls-builder-excluded-banner" role="status">
          <strong>{excludedCount}</strong> contact
          {excludedCount > 1 ? 's' : ''} exclu
          {excludedCount > 1 ? 's' : ''} car déjà dans une séance active.
        </div>
      )}

      {loading && (
        <div
          className="calls-abm-account-list"
          role="status"
          aria-busy="true"
          aria-live="polite"
        >
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="calls-abm-account-row">
              <div className="calls-abm-account-row__content">
                <Skeleton height="1.25rem" width="40%" />
                <Skeleton height="0.85rem" width="60%" />
              </div>
              <Skeleton height="2rem" width="5rem" />
            </div>
          ))}
          <p className="calls-muted calls-abm-skeleton-status">
            Recherche des comptes en cours…
          </p>
        </div>
      )}

      {!loading && searched && displayedAccounts.length === 0 && !error && (
        <EmptyState
          title="Aucun compte trouvé"
          description="Essayez un autre nom ou ajustez les filtres."
          action={
            showReturnToCibler ? (
              <Button
                variant="secondary"
                onClick={() => setStep(0)}
                aria-label="Modifier le ciblage"
              >
                Modifier le ciblage
              </Button>
            ) : undefined
          }
        />
      )}

      {!loading && !searched && displayedAccounts.length === 0 && !error && (
        <EmptyState
          title="Votre cible est vide"
          description="Définissez vos critères de recherche dans l'étape précédente pour afficher des comptes."
          action={
            showReturnToCibler ? (
              <Button
                variant="secondary"
                onClick={() => setStep(0)}
                aria-label="Définir le ciblage"
              >
                Définir le ciblage
              </Button>
            ) : undefined
          }
        />
      )}

      {!loading && displayedAccounts.length > 0 && (
        <>
          <div className="calls-abm-toolbar">
            <div className="calls-abm-actions">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleSelectAll}
                disabled={displayedAccounts
                  .filter((a) => a.contacts.length > 0)
                  .every((a) => targetList.has(a.id))}
                aria-label="Tout sélectionner"
              >
                Tout sélectionner ({displayedAccounts.length})
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleDeselectAll}
                disabled={!displayedAccounts.some((a) => targetList.has(a.id))}
                aria-label="Tout désélectionner"
              >
                Tout désélectionner
              </Button>
              {displayedAccounts.some((a) => a.contacts.length === 0) &&
                displayedAccounts.some((a) => a.contacts.length > 0) && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleSelectAll}
                    aria-label="Sélectionner uniquement les comptes avec contacts"
                  >
                    Avec contacts uniquement
                  </Button>
                )}
            </div>

            <div className="calls-field calls-field--inline">
              <span>Trier par</span>
              <Select<AbmSortOption>
                options={SORT_OPTIONS}
                value={sortBy}
                onChange={(s) => {
                  setSortBy(s);
                  writePrefs({ sortBy: s });
                }}
                aria-label="Trier les comptes"
              />
            </div>
          </div>

          <div
            className="calls-abm-account-list"
            role="list"
            aria-label="Comptes trouvés"
          >
            {hierarchicalAccounts.map(
              ({ account, isSubsidiary, subsidiaries }) => {
                const allGroupSelected =
                  subsidiaries && subsidiaries.length > 0
                    ? [
                        account.id,
                        ...subsidiaries.map((s: AccountSearchHit) => s.id),
                      ].every((id) => targetList.has(id))
                    : false;
                return (
                  <AccountRow
                    key={account.id}
                    account={account}
                    inTarget={targetList.has(account.id)}
                    onToggleTarget={handleToggleTarget}
                    isSubsidiary={isSubsidiary}
                    allGroupSelected={allGroupSelected}
                    groupSubsidiariesCount={subsidiaries?.length ?? 0}
                    onToggleGroup={
                      subsidiaries && subsidiaries.length > 0
                        ? () => handleToggleGroup(account, subsidiaries)
                        : undefined
                    }
                  />
                );
              },
            )}
          </div>
        </>
      )}

      {showReturnToCibler && (
        <div className="calls-wizard-nav">
          <Button variant="secondary" onClick={() => setStep(0)}>
            ← Précédent : Cibler
          </Button>
        </div>
      )}
    </section>
  );

  return (
    <div className="calls-view">
      <header className="calls-view__header calls-view__header--runner">
        <div className="calls-view__nav">
          <Button
            variant="secondary"
            className="calls-view__back"
            onClick={onBack}
            aria-label="Quitter la création de séance"
          >
            Quitter
          </Button>
          <div className="calls-view__titleblock">
            <h2>{STEP_TITLES[step]}</h2>
          </div>
        </div>
        <WizardStepper
          currentStep={step}
          onStepChange={handleStepChange}
          canProceedToStep2={canProceedToStep2}
          canProceedToStep3={canProceedToStep3}
        />
      </header>

      <div className="calls-abm-layout">
        <div className="calls-abm-layout__main calls-wizard-main">
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

          {/* Étape 0 : CIBLER */}
          {step === 0 && (
            <div className="calls-wizard-step-pane" data-step="cibler">
              {searchMode === null && (
                <div
                  className="calls-abm-choice-cards"
                  role="region"
                  aria-label="Mode de recherche"
                >
                  <div className="calls-abm-choice-cards__grid">
                    <Button
                      variant="secondary"
                      className="calls-abm-choice-card"
                      onClick={() => setSearchMode('name')}
                    >
                      <span className="calls-abm-choice-card__icon">
                        <SearchModeIcon />
                      </span>
                      <span className="calls-abm-choice-card__body">
                        <span className="calls-abm-choice-card__title">
                          Rechercher par nom
                        </span>
                        <span className="calls-abm-choice-card__desc">
                          Saisissez le nom d&apos;une entreprise ou son compte
                          principal
                        </span>
                      </span>
                    </Button>
                    <Button
                      variant="secondary"
                      className="calls-abm-choice-card"
                      onClick={() => setSearchMode('filters')}
                    >
                      <span className="calls-abm-choice-card__icon">
                        <FiltersModeIcon />
                      </span>
                      <span className="calls-abm-choice-card__body">
                        <span className="calls-abm-choice-card__title">
                          Rechercher par filtres
                        </span>
                        <span className="calls-abm-choice-card__desc">
                          Secteurs, effectifs, type de client, tier,
                          propriétaires
                        </span>
                      </span>
                    </Button>
                  </div>
                </div>
              )}

              {searchMode !== null && (
                <div className="calls-abm-cibler">
                  <div className="calls-abm-mode-switch">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setSearchMode(
                          searchMode === 'name' ? 'filters' : 'name',
                        )
                      }
                    >
                      {searchMode === 'name'
                        ? 'Rechercher par filtres'
                        : 'Rechercher par nom'}
                    </Button>
                  </div>

                  {searchMode === 'name' && (
                    <>
                      <div className="calls-abm-name-cards">
                        <GlassCard className="calls-abm-name-card">
                          <div className="calls-abm-name-card__header">
                            <h3 className="calls-abm-name-card__title">
                              Nom du compte
                            </h3>
                            <p className="calls-abm-name-card__desc">
                              Rechercher une entreprise directement par son nom
                            </p>
                          </div>
                          <label className="calls-field">
                            <span>Nom du compte</span>
                            <input
                              type="text"
                              className="calls-input"
                              placeholder="Rechercher une entreprise par son nom…"
                              value={query}
                              onChange={(e) => setQuery(e.target.value)}
                              onKeyDown={(e) =>
                                e.key === 'Enter' &&
                                canSearch &&
                                void handleSearch()
                              }
                              aria-label="Nom du compte"
                            />
                          </label>
                        </GlassCard>

                        <GlassCard className="calls-abm-name-card">
                          <div className="calls-abm-name-card__header">
                            <h3 className="calls-abm-name-card__title">
                              Nom du compte principal
                            </h3>
                            <p className="calls-abm-name-card__desc">
                              Rechercher le groupe et ses filiales par le nom du
                              compte principal
                            </p>
                          </div>
                          <label className="calls-field">
                            <span>Nom du compte principal</span>
                            <input
                              type="text"
                              className="calls-input"
                              value={filters.compte_principal_name ?? ''}
                              onChange={(e) =>
                                setFilter({
                                  compte_principal_name: e.target.value || null,
                                })
                              }
                              onKeyDown={(e) =>
                                e.key === 'Enter' &&
                                canSearch &&
                                void handleSearch()
                              }
                              placeholder="Ex : Danone, LVMH…"
                              aria-label="Nom du compte principal"
                            />
                          </label>
                        </GlassCard>
                      </div>

                      {(query.trim() || hasAnyFilter(filters)) && (
                        <div className="calls-fb-actions">
                          <Button
                            variant="secondary"
                            onClick={handleResetAll}
                            disabled={loading}
                            aria-label="Réinitialiser la recherche"
                          >
                            Réinitialiser
                          </Button>
                        </div>
                      )}

                      {activeChips.length > 0 && (
                        <div
                          className="calls-wizard-active-filters"
                          role="region"
                          aria-label="Filtres actifs"
                        >
                          <span className="calls-wizard-active-filters__label">
                            Filtres
                          </span>
                          {activeChips.map((chip) => (
                            <Button
                              key={`${chip.key}-${chip.value}`}
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="calls-wizard-active-filter-chip"
                              onClick={() =>
                                removeFilterItem(chip.key, chip.value)
                              }
                              aria-label={
                                chip.key === 'secteurs'
                                  ? `Retirer le secteur ${chip.label}`
                                  : `Retirer le filtre ${chip.label}`
                              }
                            >
                              <span>{chip.label}</span>
                            </Button>
                          ))}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setFilters(emptyAbmFilters())}
                            aria-label="Tout effacer les filtres"
                          >
                            Tout effacer
                          </Button>
                        </div>
                      )}

                      {renderAccountResults(false)}
                    </>
                  )}

                  {searchMode === 'filters' && (
                    <div className="calls-abm-cibler__form">
                      <GlassCard className="calls-filterbuilder">
                        {activeChips.length > 0 && (
                          <div
                            className="calls-wizard-active-filters"
                            role="region"
                            aria-label="Filtres actifs"
                          >
                            <span className="calls-wizard-active-filters__label">
                              Filtres
                            </span>
                            {activeChips.map((chip) => (
                              <Button
                                key={`${chip.key}-${chip.value}`}
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="calls-wizard-active-filter-chip"
                                onClick={() =>
                                  removeFilterItem(chip.key, chip.value)
                                }
                                aria-label={
                                  chip.key === 'secteurs'
                                    ? `Retirer le secteur ${chip.label}`
                                    : `Retirer le filtre ${chip.label}`
                                }
                              >
                                <span>{chip.label}</span>
                              </Button>
                            ))}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setFilters(emptyAbmFilters())}
                              aria-label="Tout effacer les filtres"
                            >
                              Tout effacer
                            </Button>
                          </div>
                        )}

                        <details className="calls-fb-section" open>
                          <summary>
                            <span className="calls-fb-section__title">
                              Entreprise
                              {activeFiltersCount > 0 && (
                                <span
                                  className="calls-fb-section__badge"
                                  aria-label={`${activeFiltersCount} filtres actifs`}
                                >
                                  {activeFiltersCount}
                                </span>
                              )}
                            </span>
                          </summary>
                          <div className="calls-fb-section__body">
                            <PicklistMultiSelect
                              label="Secteurs d'activité"
                              options={asOptions(SECTEUR_VALUES)}
                              groups={secteurGroups}
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
                              onChange={(type_client) =>
                                setFilter({ type_client })
                              }
                            />
                            <ChipGroup
                              label="Tier"
                              options={asOptions(TIER_VALUES)}
                              value={filters.tiers}
                              onChange={(tiers) => setFilter({ tiers })}
                            />
                            {ownerOptions.length > 0 && (
                              <ChipGroup
                                label="Propriétaire du compte"
                                hint="Commercial propriétaire du compte Salesforce"
                                options={ownerOptions}
                                value={filters.proprietaires}
                                onChange={(proprietaires) =>
                                  setFilter({ proprietaires })
                                }
                              />
                            )}
                            <label className="calls-field">
                              <span>Compte principal (ID CRM)</span>
                              <input
                                type="text"
                                className="calls-input"
                                value={filters.compte_principal ?? ''}
                                onChange={(e) =>
                                  setFilter({
                                    compte_principal: e.target.value || null,
                                  })
                                }
                                placeholder="001…"
                                aria-label="Compte principal (ID CRM)"
                              />
                            </label>
                          </div>
                        </details>
                        {(query.trim() || hasAnyFilter(filters)) && (
                          <div className="calls-fb-actions">
                            <Button
                              variant="secondary"
                              onClick={handleResetAll}
                              disabled={loading}
                              aria-label="Réinitialiser la recherche"
                            >
                              Réinitialiser
                            </Button>
                          </div>
                        )}
                      </GlassCard>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Étape 1 : COMPOSER */}
          {step === 1 && (
            <div className="calls-wizard-step-pane" data-step="composer">
              {searchMode === 'filters' && (
                <div
                  className="calls-abm-substepper"
                  role="tablist"
                  aria-label="Étapes de sélection"
                >
                  <Button
                    variant="ghost"
                    role="tab"
                    aria-selected={composerSubStep === 'accounts'}
                    className={`calls-abm-substepper__step ${composerSubStep === 'accounts' ? 'calls-abm-substepper__step--active' : ''}`}
                    onClick={() => setComposerSubStep('accounts')}
                  >
                    <span className="calls-abm-substepper__number">1</span>
                    <span className="calls-abm-substepper__label">
                      Sélectionner les comptes
                    </span>
                    {targetList.size > 0 && (
                      <Tag variant="accent">{targetList.size}</Tag>
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    role="tab"
                    aria-selected={composerSubStep === 'contacts'}
                    disabled={!canProceedToStep3}
                    className={`calls-abm-substepper__step ${composerSubStep === 'contacts' ? 'calls-abm-substepper__step--active' : ''}`}
                    onClick={() => {
                      if (canProceedToStep3) setComposerSubStep('contacts');
                    }}
                    aria-label="Affiner les contacts"
                  >
                    <span className="calls-abm-substepper__number">2</span>
                    <span className="calls-abm-substepper__label">
                      Affiner les contacts
                    </span>
                    {totalRetainedInTarget > 0 && (
                      <Tag variant="accent">{totalRetainedInTarget}</Tag>
                    )}
                  </Button>
                </div>
              )}

              {searchMode === 'filters' &&
                composerSubStep === 'accounts' &&
                renderAccountResults(true)}

              {(searchMode === 'name' ||
                (searchMode === 'filters' &&
                  composerSubStep === 'contacts')) && (
                <div className="calls-abm-composer-contacts">
                  {targetList.size === 0 ? (
                    <EmptyState
                      title={
                        lastRemovedRef.current !== null
                          ? 'Comptes retirés'
                          : 'Votre cible est vide'
                      }
                      description={
                        lastRemovedRef.current !== null
                          ? 'Remettez un compte depuis le panneau ci-dessus si vous changez d’avis, ou revenez à la recherche.'
                          : "Recherchez et sélectionnez des comptes dans l'étape précédente pour composer votre cible."
                      }
                      action={
                        <Button
                          variant="secondary"
                          onClick={() => {
                            if (searchMode === 'name') setStep(0);
                            else setComposerSubStep('accounts');
                          }}
                        >
                          {searchMode === 'name'
                            ? '← Revenir à la recherche des comptes'
                            : '← Revenir à la sélection des comptes'}
                        </Button>
                      }
                    />
                  ) : (
                    <div className="calls-wizard-target">
                      <TargetPanel
                        targetList={targetList}
                        onToggleContact={handleToggleContact}
                        onSetRetainedContacts={handleSetRetainedContacts}
                        onRemoveAccount={(id) => {
                          lastRemovedRef.current = id;
                          setTargetList((prev) => {
                            const n = new Map(prev);
                            n.delete(id);
                            return n;
                          });
                        }}
                        onRestoreAccount={(entry) => {
                          lastRemovedRef.current = null;
                          setTargetList((prev) => {
                            const n = new Map(prev);
                            if (n.has(entry.account.id)) return prev;
                            n.set(entry.account.id, entry);
                            return n;
                          });
                        }}
                        onClearTarget={() => setTargetList(new Map())}
                        hideFooter
                      />
                    </div>
                  )}

                  <div className="calls-wizard-nav">
                    {searchMode === 'name' ? (
                      <Button variant="secondary" onClick={() => setStep(0)}>
                        ← Précédent : Cibler
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        onClick={() => setComposerSubStep('accounts')}
                      >
                        ← Précédent : Comptes
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Étape 2 : PLANIFIER */}
          {step === 2 && (
            <div className="calls-wizard-step-pane" data-step="planifier">
              <GlassCard className="calls-abm-section-card">
                <div className="calls-abm-section-card__header">
                  <h3 className="calls-abm-section-card__title">
                    Informations
                  </h3>
                </div>
                <label className="calls-field">
                  <span>Nom des séances (préfixe)</span>
                  <input
                    type="text"
                    className="calls-input"
                    value={sessionName}
                    onChange={(e) => setSessionName(e.target.value)}
                    placeholder="Ex: 'ACME décisionnaires' → #1, #2, ..."
                    aria-label="Nom des séances (préfixe)"
                  />
                </label>
                <DatePicker
                  label="Date de la séance"
                  value={scheduledFor}
                  onChange={setScheduledFor}
                  min={todayParisIso()}
                />
              </GlassCard>

              <GlassCard className="calls-abm-section-card">
                <div className="calls-abm-section-card__header">
                  <h3 className="calls-abm-section-card__title">
                    Découpage en séances
                  </h3>
                </div>
                <div className="calls-fb-row">
                  <label className="calls-field">
                    <span>Contacts par séance</span>
                    <input
                      type="number"
                      className="calls-input"
                      min={1}
                      value={targetSize}
                      onChange={(e) => {
                        const n = Math.max(1, Number(e.target.value) || 1);
                        setTargetSize(n);
                        writePrefs({ targetSize: n });
                      }}
                      aria-label="Contacts par séance"
                    />
                  </label>
                  <label className="calls-field">
                    <span>Nombre max de séances</span>
                    <input
                      type="number"
                      className="calls-input"
                      min={1}
                      value={maxSessions}
                      onChange={(e) => {
                        const n = Math.max(1, Number(e.target.value) || 1);
                        setMaxSessions(n);
                        writePrefs({ maxSessions: n });
                      }}
                      aria-label="Nombre max de séances"
                    />
                  </label>
                </div>
              </GlassCard>

              <GlassCard className="calls-abm-section-card">
                <div className="calls-abm-section-card__header">
                  <h3 className="calls-abm-section-card__title">
                    Aperçu : {groups.length} séance
                    {groups.length > 1 ? 's' : ''}
                  </h3>
                </div>
                {droppedAccounts.length > 0 && (
                  <div className="calls-warn-banner" role="alert">
                    {droppedAccounts.length} compte
                    {droppedAccounts.length > 1 ? 's' : ''} écarté
                    {droppedAccounts.length > 1 ? 's' : ''} :{' '}
                    {droppedAccounts.map((a) => a.name).join(', ')}
                  </div>
                )}
                <div className="calls-abm-plan-groups">
                  {groups.map((g, i) => (
                    <div key={i} className="calls-abm-plan-group-card">
                      <div className="calls-abm-plan-group-header">
                        <strong>Séance #{i + 1}</strong>
                        <span className="xos-numeric">
                          {g.totalContacts} contacts
                        </span>
                      </div>
                      <p className="calls-muted">{g.accountNames.join(', ')}</p>
                    </div>
                  ))}
                </div>
              </GlassCard>

              <div className="calls-wizard-nav">
                <Button variant="secondary" onClick={() => setStep(1)}>
                  ← Précédent : Composer
                </Button>
              </div>
            </div>
          )}
        </div>

        <aside className="calls-abm-sidebar calls-wizard-sidebar">
          <AbmWizardRecap
            step={step}
            planVisible={step >= 2}
            searchMode={searchMode}
            matchAccountsCount={
              searchMode === 'filters' ? accounts.length : null
            }
            matchAccountsCapped={searchMode === 'filters' ? truncated : false}
            composerSubStep={composerSubStep}
            query={query}
            activeFiltersCount={activeFiltersCount}
            secteursCount={filters.secteurs.length}
            effectifsCount={filters.effectifs.length}
            typeClientCount={filters.type_client.length}
            tiersCount={filters.tiers.length}
            proprietairesCount={filters.proprietaires.length}
            targetAccountsCount={targetList.size}
            targetContactsCount={totalRetainedInTarget}
            sessionName={sessionName}
            scheduledFor={scheduledFor}
            sessionsCount={groups.length}
            targetSize={targetSize}
            droppedAccountsCount={droppedAccounts.length}
            canProceedToStep2={canProceedToStep2}
            canProceedToStep3={canProceedToStep3}
            canLaunchSession={canLaunchSession}
            creating={creating}
            onNext={handleNext}
            onStepClick={handleStepChange}
          />
        </aside>
      </div>

      <ConfirmDialog
        open={confirmResetOpen}
        title="Réinitialiser la recherche"
        description={`Réinitialiser la recherche effacera aussi ${targetList.size} compte${targetList.size > 1 ? 's' : ''} sélectionné${targetList.size > 1 ? 's' : ''}. Continuer ?`}
        confirmLabel="Réinitialiser"
        cancelLabel="Annuler"
        onConfirm={executeResetAll}
        onCancel={() => setConfirmResetOpen(false)}
      />
    </div>
  );
}
