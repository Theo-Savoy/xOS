import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button, Checkbox, GlassCard, Select, Tag } from '../../../../components/ui';
import {
  CONTACT_LIMIT_OPTIONS,
  CONTACT_LIST_UNLIMITED,
  MAX_PER_COMPANY_OPTIONS,
  type CallTargetPreset,
  type ContactLimit,
  type DedupEntry,
  type FilterTree,
  type MaxPerCompany,
} from '../../../../crm';
import { DedupBanner, type DedupMode } from '../../DedupBanner';
import { FilterBuilder } from '../../FilterBuilder';
import {
  countContactFilters,
  countEntrepriseFilters,
  countRelanceFilters,
} from '../../filterCounts';
import { DatePicker, SessionTypePicker } from '../../formControls';
import { todayParisIso } from '../../formControls.helpers';
import { canSelectContact, selectIdsWithCompanyCap } from '../../selection';
import { packAccountsIntoSessions } from '../../audienceBinPacking';
import type { AudienceSessionGroup } from '../../api';
import type { ContactPreview, SessionType, TeamMember } from '../../types';
import { WizardStepper, type WizardStep } from './WizardStepper';
import { WizardRecap } from './WizardRecap';

type NewSessionViewProps = {
  filters: FilterTree;
  onFiltersChange: (next: FilterTree) => void;
  contactLimit: ContactLimit;
  onContactLimitChange: (limit: ContactLimit) => void;
  maxPerCompany: MaxPerCompany | null;
  onMaxPerCompanyChange: (value: MaxPerCompany | null) => void;
  loading: boolean;
  previewLoading: boolean;
  matchCount: number | null;
  matchCountCapped: boolean;
  matchCountLoading: boolean;
  matchCountError: string | null;
  error: string | null;
  preview: ContactPreview[];
  dedup: DedupEntry[];
  excludedCount?: number;
  previewTruncated: boolean;
  presets: CallTargetPreset[];
  presetsLoading: boolean;
  savingPreset: boolean;
  currentUserId: string;
  team?: TeamMember[];
  onBack: () => void;
  onOpenAccountSearch?: () => void;
  onLoadPreset: (preset: CallTargetPreset) => void;
  onSavePreset: (name: string, shared: boolean) => void;
  onDeletePreset: (id: number) => void;
  onCreate: (
    name: string,
    contacts: ContactPreview[],
    scheduledFor: string,
    sessionType: SessionType,
    memberUserIds: string[],
  ) => void;
  onCreateAudience?: (payload: {
    groups: AudienceSessionGroup[];
    targetSize: number;
    maxSessions: number;
    namePrefix?: string;
    excludedCount: number;
    scheduledFor: string;
    sessionType: SessionType;
  }) => void;
  initialStep?: WizardStep;
};

function Cell({
  children,
  title,
  className,
}: {
  children: ReactNode;
  title?: string | null;
  className?: string;
}) {
  const tip = title ?? (typeof children === 'string' ? children : undefined);
  return (
    <span
      className={['calls-preview__cell', className].filter(Boolean).join(' ')}
      title={tip || undefined}
    >
      {children}
    </span>
  );
}

function limitLabel(limit: ContactLimit): string {
  return limit === CONTACT_LIST_UNLIMITED
    ? 'Pas de limite (max 2000)'
    : String(limit);
}

export function NewSessionView({
  filters,
  onFiltersChange,
  contactLimit,
  onContactLimitChange,
  maxPerCompany,
  onMaxPerCompanyChange,
  loading,
  previewLoading,
  matchCount,
  matchCountCapped,
  matchCountLoading,
  matchCountError,
  error,
  preview,
  dedup,
  excludedCount = 0,
  previewTruncated,
  presets,
  savingPreset,
  currentUserId,
  team = [],
  onBack,
  onLoadPreset,
  onSavePreset,
  onDeletePreset,
  onCreate,
  onCreateAudience,
  initialStep = 0,
}: NewSessionViewProps) {
  const [step, setStep] = useState<WizardStep>(initialStep);
  const [sessionName, setSessionName] = useState('');
  const [scheduledFor, setScheduledFor] = useState(todayParisIso);
  const [sessionType, setSessionType] = useState<SessionType>('prospection');
  const [dedupMode, setDedupMode] = useState<DedupMode>('avertir');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [shareMemberIds, setShareMemberIds] = useState<Set<string>>(new Set());
  const [capHint, setCapHint] = useState<string | null>(null);
  const [splitSessions, setSplitSessions] = useState(false);
  const [targetSize, setTargetSize] = useState(50);
  const [maxSessions, setMaxSessions] = useState(5);

  useEffect(() => {
    if (initialStep !== undefined) {
      setStep(initialStep);
    }
  }, [initialStep]);

  const shareableTeam = useMemo(
    () =>
      team.filter(
        (member) =>
          member.user_id &&
          member.user_id !== currentUserId &&
          !String(member.user_id).startsWith('map:'),
      ),
    [team, currentUserId],
  );

  const allTeamSelected =
    shareableTeam.length > 0 &&
    shareableTeam.every((m) => shareMemberIds.has(m.user_id));

  const inSessionOf = useMemo(
    () => new Map(dedup.map((d) => [d.sf_contact_id, d.in_session_of])),
    [dedup],
  );

  const eligibleIds = useMemo(() => {
    const dedupSet = new Set(dedup.map((entry) => entry.sf_contact_id));
    return new Set(
      preview
        .map((contact) => contact.sf_contact_id)
        .filter((id) => dedupMode !== 'exclure' || !dedupSet.has(id)),
    );
  }, [preview, dedup, dedupMode]);

  // La preview se recalcule automatiquement à chaque changement de filtre :
  // on ne réinitialise la sélection qu'au tout premier chargement (cap par
  // défaut) puis, aux rafraîchissements suivants, on ne retire que les
  // contacts qui ont disparu de la nouvelle liste — le reste de la
  // sélection manuelle de l'utilisateur survit au refresh.
  const hadPreviewRef = useRef(false);

  useEffect(() => {
    if (preview.length === 0) {
      hadPreviewRef.current = false;
      setSelectedIds(new Set());
      setCapHint(null);
      return;
    }
    if (!hadPreviewRef.current) {
      hadPreviewRef.current = true;
      setSelectedIds(
        selectIdsWithCompanyCap(preview, maxPerCompany, eligibleIds),
      );
      setCapHint(
        maxPerCompany
          ? `Aperçu : max ${maxPerCompany}/entreprise, jusqu'à ${contactLimit} contacts (priorité directeurs / responsables).`
          : null,
      );
      return;
    }
    const previewIds = new Set(preview.map((c) => c.sf_contact_id));
    setSelectedIds((current) => {
      const next = new Set(
        [...current].filter((id) => previewIds.has(id) && eligibleIds.has(id)),
      );
      return next;
    });
  }, [preview, eligibleIds, maxPerCompany, contactLimit]);

  const selectedContacts = useMemo(
    () => preview.filter((contact) => selectedIds.has(contact.sf_contact_id)),
    [preview, selectedIds],
  );

  const packableAccounts = useMemo(() => {
    const grouped = new Map<string, ContactPreview[]>();
    for (const contact of selectedContacts) {
      const id = contact.sf_account_id || contact.sf_contact_id;
      const current = grouped.get(id) ?? [];
      current.push(contact);
      grouped.set(id, current);
    }
    return [...grouped.entries()].map(([id, contacts]) => ({
      id,
      name: contacts[0]?.account_name || 'Compte non renseigné',
      contacts,
    }));
  }, [selectedContacts]);

  const packedGroups = useMemo(
    () => packAccountsIntoSessions(packableAccounts, targetSize, maxSessions),
    [packableAccounts, targetSize, maxSessions],
  );

  const toggleContact = (contactId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(contactId)) {
        next.delete(contactId);
        setCapHint(null);
        return next;
      }
      if (!canSelectContact(preview, current, contactId, maxPerCompany)) {
        setCapHint(
          maxPerCompany
            ? `Maximum ${maxPerCompany} contact${maxPerCompany > 1 ? 's' : ''} par entreprise.`
            : null,
        );
        return current;
      }
      next.add(contactId);
      setCapHint(null);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(
      selectIdsWithCompanyCap(preview, maxPerCompany, eligibleIds),
    );
    setCapHint(
      maxPerCompany
        ? `Sélection limitée à ${maxPerCompany}/entreprise (directeurs / responsables prioritaires).`
        : null,
    );
  };
  const deselectAll = () => {
    setSelectedIds(new Set());
    setCapHint(null);
  };

  const toggleShareMember = (userId: string) => {
    setShareMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const toggleAllTeam = () => {
    if (allTeamSelected) {
      setShareMemberIds(new Set());
      return;
    }
    setShareMemberIds(new Set(shareableTeam.map((m) => m.user_id)));
  };

  const handleCreate = () => {
    const name = sessionName.trim();
    if (!name || selectedContacts.length === 0) return;
    if (splitSessions && onCreateAudience && packedGroups.length > 0) {
      onCreateAudience({
        groups: packedGroups.map((group) => ({
          account_ids: group.accountIds,
          contacts: group.contacts,
        })),
        targetSize,
        maxSessions,
        namePrefix: name,
        excludedCount,
        scheduledFor,
        sessionType,
      });
      return;
    }
    onCreate(name, selectedContacts, scheduledFor, sessionType, [
      ...shareMemberIds,
    ]);
  };

  const activeFiltersCount = useMemo(
    () =>
      countEntrepriseFilters(filters.entreprise) +
      countContactFilters(filters.contact) +
      countRelanceFilters(filters.relance),
    [filters],
  );

  const hasTargetAccounts = Boolean(filters.entreprise.comptes_cibles?.length);

  const canProceedToStep2 =
    activeFiltersCount > 0 ||
    hasTargetAccounts ||
    preview.length > 0 ||
    (matchCount !== null && matchCount > 0);

  const canProceedToStep3 = selectedContacts.length > 0;

  const canLaunchSession =
    Boolean(sessionName.trim()) &&
    selectedContacts.length > 0 &&
    (!splitSessions || packedGroups.length > 0);

  const renderActiveFilterChips = () => {
    const chips: { key: string; label: string }[] = [];
    if (filters.entreprise.secteurs.length > 0) {
      chips.push({
        key: 'secteurs',
        label: `Secteurs (${filters.entreprise.secteurs.length})`,
      });
    }
    if (filters.entreprise.effectifs.length > 0) {
      chips.push({
        key: 'effectifs',
        label: `Effectifs (${filters.entreprise.effectifs.length})`,
      });
    }
    if (filters.entreprise.tiers.length > 0) {
      chips.push({
        key: 'tiers',
        label: `Tier : ${filters.entreprise.tiers.join(', ')}`,
      });
    }
    if (filters.entreprise.type_client.length > 0) {
      chips.push({
        key: 'type_client',
        label: `Type : ${filters.entreprise.type_client.join(', ')}`,
      });
    }
    if (filters.entreprise.proprietaires.length > 0) {
      chips.push({
        key: 'proprietaires',
        label: `Propriétaires (${filters.entreprise.proprietaires.length})`,
      });
    }
    if (filters.contact.fonctions.length > 0) {
      chips.push({
        key: 'fonctions',
        label: `Fonctions (${filters.contact.fonctions.length})`,
      });
    }
    if (!filters.contact.a_telephone) {
      chips.push({ key: 'tel', label: 'Sans mobile requis' });
    }
    if (!filters.contact.exclure_npa) {
      chips.push({ key: 'npa', label: 'Inclure NPA' });
    }
    if (filters.relance.jamais_appele) {
      chips.push({ key: 'jamais', label: 'Jamais appelé' });
    }
    if (filters.relance.dernier_appel_avant_jours !== null) {
      chips.push({
        key: 'avant',
        label: `Inactif > ${filters.relance.dernier_appel_avant_jours}j`,
      });
    }
    if (filters.relance.dernier_appel_dans_jours !== null) {
      chips.push({
        key: 'dans',
        label: `Appelé < ${filters.relance.dernier_appel_dans_jours}j`,
      });
    }
    if (filters.relance.dernier_resultat.length > 0) {
      chips.push({
        key: 'resultat',
        label: `Résultats (${filters.relance.dernier_resultat.length})`,
      });
    }
    if (filters.entreprise.compte_principal) {
      chips.push({
        key: 'principal',
        label: `Groupe : ${filters.entreprise.compte_principal}`,
      });
    }

    return chips.map((chip) => (
      <Button
        key={chip.key}
        type="button"
        variant="ghost"
        size="sm"
        className="calls-wizard-active-filter-chip"
        onClick={() => setStep(0)}
        title="Modifier dans l'étape Cibler"
        aria-label={`${chip.label} — cliquer pour modifier`}
      >
        <span>{chip.label}</span>
      </Button>
    ));
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
            <Tag variant="accent">Nouvelle séance</Tag>
            <h2>Composer une liste</h2>
          </div>
        </div>
        <WizardStepper
          currentStep={step}
          onStepChange={setStep}
          canProceedToStep2={canProceedToStep2}
          canProceedToStep3={canProceedToStep3}
        />
      </header>

      <div className="calls-wizard-layout">
        <div className="calls-wizard-main">
        {error && (
          <GlassCard className="calls-error">
            <p role="alert" aria-live="assertive">
              {error}
            </p>
          </GlassCard>
        )}

        {/* Étape 1 : CIBLER */}
        {step === 0 && (
          <div className="calls-wizard-step-pane" data-step="cibler">
            <FilterBuilder
              filters={filters}
              onChange={onFiltersChange}
              previewCount={preview.length > 0 ? preview.length : null}
              previewLoading={previewLoading}
              matchCount={matchCount}
              matchCountCapped={matchCountCapped}
              matchCountLoading={matchCountLoading}
                matchCountError={matchCountError}
              presets={presets}
                savingPreset={savingPreset}
                currentUserId={currentUserId}
                onLoadPreset={onLoadPreset}
                onSavePreset={onSavePreset}
                onDeletePreset={onDeletePreset}
                team={team}
              />

              <div className="calls-wizard-nav calls-wizard-nav--end">
                <Button
                  onClick={() => setStep(1)}
                  disabled={!canProceedToStep2}
                >
                  Continuer vers Composer →
                </Button>
              </div>
            </div>
          )}

          {/* Étape 2 : COMPOSER */}
          {step === 1 && (
            <div className="calls-wizard-step-pane" data-step="composer">
              {activeFiltersCount > 0 && (
                <div
                  className="calls-wizard-active-filters"
                  role="region"
                  aria-label="Filtres actifs"
                >
                  <span className="calls-wizard-active-filters__label">
                    Filtres actifs ({activeFiltersCount}) :
                  </span>
                  {renderActiveFilterChips()}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setStep(0)}
                    aria-label="Modifier les filtres cibles (retour étape 1)"
                  >
                    Modifier
                  </Button>
                </div>
              )}

              {previewTruncated && (
                <GlassCard className="calls-truncated-banner" role="status">
                  <p>Résultats partiels : affinez vos filtres.</p>
                </GlassCard>
              )}

              {excludedCount > 0 && (
                <div className="calls-builder-excluded-banner" role="status">
                  <strong>{excludedCount}</strong> contact
                  {excludedCount > 1 ? 's' : ''} exclu
                  {excludedCount > 1 ? 's' : ''} car déjà dans une séance active.
                </div>
              )}

              {dedup.length > 0 && (
                <DedupBanner
                  dedup={dedup}
                  mode={dedupMode}
                  onModeChange={setDedupMode}
                />
              )}

              {preview.length > 0 && (
                <GlassCard className="calls-preview">
                  <div className="calls-preview__header">
                    <div className="calls-preview__heading">
                      <h3>
                        Aperçu — {preview.length} contact
                        {preview.length > 1 ? 's' : ''} trouvé
                        {preview.length > 1 ? 's' : ''}
                      </h3>
                      <Tag>
                        {selectedContacts.length} sélectionné
                        {selectedContacts.length > 1 ? 's' : ''} / {preview.length}
                      </Tag>
                      {previewLoading && (
                        <Tag role="status" aria-live="polite">
                          Mise à jour…
                        </Tag>
                      )}
                    </div>
                    <div className="calls-preview__actions">
                      <Button variant="secondary" onClick={selectAll}>
                        Tout sélectionner
                      </Button>
                      <Button variant="secondary" onClick={deselectAll}>
                        Tout désélectionner
                      </Button>
                    </div>
                  </div>
                  <div className="calls-preview__limits">
                    <Select
                      label="Contacts max"
                      options={CONTACT_LIMIT_OPTIONS.map((limit) => ({
                        value: String(limit),
                        label: limitLabel(limit),
                      }))}
                      value={String(contactLimit)}
                      onChange={(val) =>
                        onContactLimitChange(Number(val) as ContactLimit)
                      }
                      aria-label="Contacts max"
                    />
                    <Select
                      label="Max / entreprise"
                      options={[
                        { value: '', label: 'Pas de limite' },
                        ...MAX_PER_COMPANY_OPTIONS.map((limit) => ({
                          value: String(limit),
                          label: `${limit} par entreprise`,
                        })),
                      ]}
                      value={maxPerCompany ? String(maxPerCompany) : ''}
                      onChange={(val) =>
                        onMaxPerCompanyChange(
                          val ? (Number(val) as MaxPerCompany) : null,
                        )
                      }
                      aria-label="Maximum de contacts par entreprise"
                    />
                  </div>
                  {capHint && (
                    <p
                      className="calls-preview__cap-hint"
                      role="status"
                      aria-live="polite"
                    >
                      {capHint}
                    </p>
                  )}
                  <div className="calls-preview__table-wrap">
                    <ul className="calls-preview__list">
                      <li
                        className="calls-preview__list-header"
                        aria-hidden="true"
                      >
                        <span className="calls-preview__select" />
                        <span>Contact</span>
                        <span>Poste</span>
                        <span>Entreprise</span>
                        <span>Email</span>
                        <span>Tél.</span>
                        <span>LinkedIn</span>
                        <span>Statut</span>
                      </li>
                      {preview.map((contact) => {
                        const dup = inSessionOf.get(contact.sf_contact_id);
                        const checked = selectedIds.has(contact.sf_contact_id);
                        const blocked =
                          !checked &&
                          !canSelectContact(
                            preview,
                            selectedIds,
                            contact.sf_contact_id,
                            maxPerCompany,
                          );
                        const phone =
                          contact.phone ?? contact.mobile_phone ?? null;
                        return (
                          <li
                            key={contact.sf_contact_id}
                            className={
                              !checked
                                ? 'calls-preview__row--excluded'
                                : undefined
                            }
                          >
                            <span className="calls-preview__select">
                              <Checkbox
                                checked={checked}
                                disabled={blocked}
                                onChange={() =>
                                  toggleContact(contact.sf_contact_id)
                                }
                                aria-label={`Sélectionner ${contact.contact_name}`}
                              />
                            </span>
                            <Cell
                              className="calls-preview__name"
                              title={contact.contact_name}
                            >
                              <strong>{contact.contact_name}</strong>
                            </Cell>
                            <Cell
                              className="calls-preview__cell--wrap"
                              title={contact.title}
                            >
                              {contact.title ?? '—'}
                            </Cell>
                            <Cell
                              className="calls-preview__cell--wrap"
                              title={contact.account_name}
                            >
                              {contact.account_name ?? '—'}
                            </Cell>
                            <Cell
                              className="calls-preview__cell--wrap"
                              title={contact.email}
                            >
                              {contact.email ? (
                                <a
                                  href={`mailto:${contact.email}`}
                                  className="calls-preview__email"
                                >
                                  {contact.email}
                                </a>
                              ) : (
                                '—'
                              )}
                            </Cell>
                            <Cell className="xos-numeric" title={phone}>
                              {phone ?? '—'}
                            </Cell>
                            {contact.linkedin_url ? (
                              <a
                                href={contact.linkedin_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="calls-preview__linkedin"
                              >
                                LinkedIn
                              </a>
                            ) : (
                              <Cell>—</Cell>
                            )}
                            {dup ? (
                              <Tag
                                variant="alert"
                                className="calls-preview__dup"
                                title={`Déjà en séance — ${dup}`}
                              >
                                Déjà en séance — {dup}
                              </Tag>
                            ) : (
                              <Cell>—</Cell>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </GlassCard>
              )}

              {previewLoading && preview.length === 0 && (
                <GlassCard
                  className="calls-empty calls-empty--hero"
                  role="status"
                  aria-live="polite"
                >
                  <Tag variant="accent">Ciblage</Tag>
                  <h3>Mise à jour…</h3>
                  <p>Calcul de la liste correspondant à vos filtres.</p>
                </GlassCard>
              )}

              {!previewLoading && preview.length === 0 && !error && (
                <GlassCard className="calls-empty calls-empty--hero">
                  <Tag variant="accent">Ciblage</Tag>
                  <h3>Aucun contact trouvé</h3>
                  <p>
                    Ajustez vos filtres dans l&apos;étape précédente pour
                    trouver des contacts correspondants.
                  </p>
                  <Button variant="secondary" onClick={() => setStep(0)}>
                    ← Revenir à l&apos;étape Cibler
                  </Button>
                </GlassCard>
              )}

              <div className="calls-wizard-nav">
                <Button variant="secondary" onClick={() => setStep(0)}>
                  ← Précédent : Cibler
                </Button>
                <Button
                  onClick={() => setStep(2)}
                  disabled={!canProceedToStep3}
                >
                  Continuer vers Planifier →
                </Button>
              </div>
            </div>
          )}

          {/* Étape 3 : PLANIFIER */}
          {step === 2 && (
            <div className="calls-wizard-step-pane" data-step="planifier">
              <GlassCard className="calls-name-form">
                <div className="calls-name-form__meta">
                  <Tag>
                    {selectedContacts.length} contact
                    {selectedContacts.length > 1 ? 's' : ''} sélectionné
                    {selectedContacts.length > 1 ? 's' : ''}
                  </Tag>
                </div>
                <label className="calls-field">
                  <span>Nom de la séance</span>
                  <input
                    type="text"
                    value={sessionName}
                    onChange={(e) => setSessionName(e.target.value)}
                    placeholder="Prospection Lyon"
                    className="calls-input"
                  />
                </label>
                <DatePicker
                  label="Date de séance"
                  value={scheduledFor}
                  onChange={setScheduledFor}
                />
                <SessionTypePicker
                  value={sessionType}
                  onChange={setSessionType}
                />

                {onCreateAudience && (
                  <div className="calls-name-form__split">
                    <Checkbox
                      checked={splitSessions}
                      onChange={setSplitSessions}
                      label="Découper en plusieurs séances"
                      aria-label="Découper en plusieurs séances"
                    />
                    {splitSessions && (
                      <>
                        <div className="calls-fb-row">
                          <label className="calls-field">
                            <span>Taille cible par séance</span>
                            <input
                              type="number"
                              className="calls-input"
                              min={1}
                              value={targetSize}
                              onChange={(event) =>
                                setTargetSize(
                                  Math.max(1, Number(event.target.value) || 1),
                                )
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
                              onChange={(event) =>
                                setMaxSessions(
                                  Math.max(1, Number(event.target.value) || 1),
                                )
                              }
                            />
                          </label>
                        </div>
                        <p className="calls-muted calls-fb-hint" role="status">
                          Aperçu : {packedGroups.length} séance
                          {packedGroups.length > 1 ? 's' : ''} · les contacts
                          d&apos;un même compte restent ensemble.
                        </p>
                      </>
                    )}
                  </div>
                )}

                {shareableTeam.length > 0 && (
                  <div className="calls-name-form__share">
                    <div className="calls-name-form__share-head">
                      <span>Partager avec</span>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className={`calls-list-filter-chip${allTeamSelected ? ' calls-list-filter-chip--active' : ''}`}
                        aria-pressed={allTeamSelected}
                        onClick={toggleAllTeam}
                      >
                        Toute l&apos;équipe
                      </Button>
                    </div>
                    <div
                      className="calls-name-form__share-chips"
                      role="group"
                      aria-label="Collègues"
                    >
                      {shareableTeam.map((member) => {
                        const checked = shareMemberIds.has(member.user_id);
                        return (
                          <span
                            key={member.user_id}
                            className={`calls-share-chip${checked ? ' calls-share-chip--active' : ''}`}
                          >
                            <Checkbox
                              checked={checked}
                              onChange={() => toggleShareMember(member.user_id)}
                              label={member.label}
                            />
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
              </GlassCard>

              <div className="calls-wizard-nav">
                <Button variant="secondary" onClick={() => setStep(1)}>
                  ← Précédent : Composer
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={loading || !canLaunchSession}
                >
                  {loading
                    ? 'Création…'
                    : splitSessions
                      ? `Créer ${packedGroups.length} séance${packedGroups.length > 1 ? 's' : ''}`
                      : 'Lancer la séance'}
                </Button>
              </div>
            </div>
          )}
        </div>

        <aside className="calls-wizard-sidebar">
          <WizardRecap
            step={step}
            filters={filters}
            matchCount={matchCount}
            matchCountCapped={matchCountCapped}
            matchCountLoading={matchCountLoading}
            previewCount={preview.length}
            selectedCount={selectedContacts.length}
            sessionName={sessionName}
            scheduledFor={scheduledFor}
            sessionType={sessionType}
            shareMemberCount={shareMemberIds.size}
            splitSessions={splitSessions}
            packedSessionsCount={packedGroups.length}
            onStepClick={(targetStep) => {
              if (targetStep === 0) setStep(0);
              else if (targetStep === 1 && canProceedToStep2) setStep(1);
              else if (
                targetStep === 2 &&
                canProceedToStep2 &&
                canProceedToStep3
              )
                setStep(2);
            }}
          />
        </aside>
      </div>

      <div
        className="calls-wizard-bottom-bar"
        role="region"
        aria-label="Action rapide"
      >
        <div className="calls-wizard-bottom-bar__info xos-numeric">
          <strong>{selectedContacts.length}</strong> sélectionné
          {selectedContacts.length > 1 ? 's' : ''}
        </div>
        <Button
          size="sm"
          onClick={() => {
            if (step === 0 && canProceedToStep2) setStep(1);
            else if (step === 1 && canProceedToStep3) setStep(2);
            else if (step === 2 && canLaunchSession) handleCreate();
          }}
          disabled={
            step === 0
              ? !canProceedToStep2
              : step === 1
                ? !canProceedToStep3
                : !canLaunchSession || loading
          }
        >
          {step === 0
            ? 'Composer ▸'
            : step === 1
              ? 'Planifier ▸'
              : loading
                ? 'Création…'
                : 'Lancer ▸'}
        </Button>
      </div>
    </div>
  );
}
