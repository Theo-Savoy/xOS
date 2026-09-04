import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Button,
  DatePicker,
  EmptyState,
  GlassCard,
  Skeleton,
  Tag,
} from '../../components/ui';
import {
  emptyFilterTree,
  normalizeFilterTree,
  type CallTargetPreset,
  type ContactLimit,
  type DedupEntry,
  type FilterTree,
  type MaxPerCompany,
} from '../../crm';
import { DedupBanner, type DedupMode } from './DedupBanner';
import {
  fetchContactList,
  fetchReports,
  fetchRunReport,
  CallsApiError,
  type AudienceSessionGroup,
  type SalesforceReport,
  type SalesforceReportRun,
} from './api';
import { packAccountsIntoSessions } from './audienceBinPacking';
import { FilterBuilder } from './FilterBuilder';
import {
  countContactFilters,
  countEntrepriseFilters,
  countRelanceFilters,
} from './filterCounts';
import { SessionTypePicker } from './formControls';
import { todayParisIso, formatActivityDateFr } from './formControls.helpers';
import { canSelectContact, selectIdsWithCompanyCap } from './selection';
import type { ContactPreview, SessionType, TeamMember } from './types';
import { AbmWizardRecap } from './abm/AbmWizardRecap';
import { ContactPreviewCard } from './modules/sessions/ContactPreviewCard';

type ReportStep = 0 | 1 | 2 | 3;
type ReportRecapStep = 0 | 1 | 2;

type ReportStepDefinition = {
  id: ReportStep;
  number: string;
  label: string;
  desc: string;
};

const REPORT_STEPS: readonly ReportStepDefinition[] = [
  { id: 0, number: '1', label: 'Cibler', desc: 'Rapport Salesforce' },
  { id: 1, number: '2', label: 'Filtrer', desc: 'Filtres & critères' },
  { id: 2, number: '3', label: 'Composer', desc: 'Sélection des contacts' },
  { id: 3, number: '4', label: 'Planifier', desc: 'Nom, date & options' },
];

type ReportWizardStepperProps = {
  currentStep: ReportStep;
  onStepChange: (step: ReportStep) => void;
  canProceedToStep1: boolean;
  canProceedToStep2: boolean;
  canProceedToStep3: boolean;
};

function ReportStepCheckIcon(): ReactNode {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="calls-wizard-step__check-icon"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ReportStepChevron(): ReactNode {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="calls-wizard-stepper__chevron"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function ReportWizardStepper({
  currentStep,
  onStepChange,
  canProceedToStep1,
  canProceedToStep2,
  canProceedToStep3,
}: ReportWizardStepperProps) {
  const isStepAccessible = (stepId: ReportStep): boolean => {
    if (stepId === 0) return true;
    if (stepId === 1) return canProceedToStep1;
    if (stepId === 2) return canProceedToStep2;
    return canProceedToStep3;
  };

  const isStepCompleted = (stepId: ReportStep): boolean => {
    if (stepId === 0) return canProceedToStep1 && currentStep > 0;
    if (stepId === 1) return canProceedToStep2 && currentStep > 1;
    if (stepId === 2) return canProceedToStep3 && currentStep > 2;
    return false;
  };

  return (
    <nav
      className="calls-wizard-stepper"
      aria-label="Étapes de composition de la séance"
    >
      <ol className="calls-wizard-stepper__list">
        {REPORT_STEPS.map((step, index) => {
          const isActive = currentStep === step.id;
          const isCompleted = isStepCompleted(step.id);
          const accessible = isStepAccessible(step.id);
          const itemClasses = [
            'calls-wizard-step',
            isActive && 'calls-wizard-step--active',
            isCompleted && 'calls-wizard-step--completed',
            !accessible && 'calls-wizard-step--disabled',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <li key={step.id} className={itemClasses}>
              <Button
                type="button"
                variant="ghost"
                className="calls-wizard-step__btn"
                onClick={() => accessible && onStepChange(step.id)}
                disabled={!accessible}
                aria-current={isActive ? 'step' : undefined}
                aria-label={`Étape ${step.number}: ${step.label} (${step.desc})`}
              >
                <span className="calls-wizard-step__indicator">
                  {isCompleted ? <ReportStepCheckIcon /> : step.number}
                </span>
                <span className="calls-wizard-step__content">
                  <span className="calls-wizard-step__label">{step.label}</span>
                  <span className="calls-wizard-step__desc">{step.desc}</span>
                </span>
              </Button>
              {index < REPORT_STEPS.length - 1 && (
                <span
                  className="calls-wizard-stepper__divider"
                  aria-hidden="true"
                >
                  <ReportStepChevron />
                </span>
              )}
            </li>
          );
        })}
      </ol>

      <div className="calls-wizard-stepper__mobile" aria-hidden="true">
        <span className="calls-wizard-stepper__mobile-badge">
          {currentStep + 1} / {REPORT_STEPS.length}
        </span>
        <span className="calls-wizard-stepper__mobile-text">
          {REPORT_STEPS[currentStep].label}
        </span>
      </div>
    </nav>
  );
}

export type ReportAudiencePayload = {
  groups: AudienceSessionGroup[];
  targetSize: number;
  maxSessions: number;
  namePrefix?: string;
  excludedCount: number;
  scheduledFor?: string;
  sessionType?: SessionType;
};

export type ReportSessionViewProps = {
  token: string;
  team?: TeamMember[];
  currentUserId?: string;
  onBack: () => void;
  onCreateAudience: (payload: ReportAudiencePayload) => void;
  creating: boolean;
  createError: string | null;
  initialStep?: ReportStep;
  presets?: CallTargetPreset[];
  savingPreset?: boolean;
  onLoadPreset?: (preset: CallTargetPreset) => void;
  onSavePreset?: (name: string, shared: boolean) => void;
  onDeletePreset?: (id: number) => void;
};

const STEP_TITLES: Record<ReportStep, string> = {
  0: 'Choisissez un rapport Salesforce',
  1: 'Filtrez les contacts du rapport',
  2: 'Sélectionnez les contacts à appeler',
  3: 'Planifiez et répartissez vos séances',
};

const NO_CONTACTS_ERROR = 'Ce rapport n’expose ni contact ni compte';

function errorMessage(err: unknown): string {
  if (err instanceof CallsApiError) {
    if (err.status === 401 || err.code === 'sf_auth_error') {
      return 'Salesforce a refusé l’authentification — reconnectez-vous.';
    }
    if (err.code === 'invalid_query') {
      return 'Réduisez la recherche du rapport à 100 caractères maximum.';
    }
    if (err.code === 'sf_query_error') {
      return 'Salesforce a refusé la requête du rapport.';
    }
    if (err.code === 'report_not_found') {
      return 'Ce rapport est introuvable ou a été supprimé dans Salesforce.';
    }
    if (err.code === 'sf_analytics_error') {
      return 'Salesforce a refusé l’exécution du rapport.';
    }
    if (err.code === 'invalid_contacts_cibles') {
      return 'Le rapport contient trop de contacts — affinez-le dans Salesforce.';
    }
    return 'Une erreur est survenue. Réessayez.';
  }
  return 'Une erreur est survenue. Réessayez.';
}

function RunMetric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="calls-report-run__metric">
      <dt>{label}</dt>
      <dd className="xos-numeric">{value}</dd>
    </div>
  );
}

export function ReportSessionView({
  token,
  team = [],
  currentUserId = '',
  onBack,
  onCreateAudience,
  creating,
  createError,
  initialStep,
  presets = [],
  savingPreset = false,
  onLoadPreset,
  onSavePreset,
  onDeletePreset,
}: ReportSessionViewProps) {
  const [step, setStep] = useState<ReportStep>(initialStep ?? 0);
  const [query, setQuery] = useState('');
  const [reports, setReports] = useState<SalesforceReport[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsError, setReportsError] = useState<string | null>(null);
  const [selectedReportId, setSelectedReportId] = useState('');
  const [reportRun, setReportRun] = useState<SalesforceReportRun | null>(null);
  const [runLoading, setRunLoading] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterTree>(emptyFilterTree());
  const [contactLimit, setContactLimit] = useState<ContactLimit>(200);
  const [maxPerCompany, setMaxPerCompany] = useState<MaxPerCompany | null>(
    null,
  );
  const [preview, setPreview] = useState<ContactPreview[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewTruncated, setPreviewTruncated] = useState(false);
  const [excludedCount, setExcludedCount] = useState(0);
  const [dedup, setDedup] = useState<DedupEntry[]>([]);
  const [dedupMode, setDedupMode] = useState<DedupMode>('avertir');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [capHint, setCapHint] = useState<string | null>(null);
  const [sessionName, setSessionName] = useState('');
  const [scheduledFor, setScheduledFor] = useState(todayParisIso);
  const [sessionType, setSessionType] = useState<SessionType>('prospection');
  const [targetSize, setTargetSize] = useState(50);
  const [maxSessions, setMaxSessions] = useState(5);

  const reportsRequest = useRef(0);
  const previewRequest = useRef(0);
  const hadPreviewRef = useRef(false);

  useEffect(() => {
    if (initialStep !== undefined) setStep(initialStep);
  }, [initialStep]);

  useEffect(() => {
    if (!token) return;
    const requestId = reportsRequest.current + 1;
    reportsRequest.current = requestId;
    setReportsLoading(true);
    setReportsError(null);

    const timer = window.setTimeout(() => {
      void fetchReports(token, query.trim())
        .then((data) => {
          if (reportsRequest.current !== requestId) return;
          setReports(data.reports);
        })
        .catch((err) => {
          if (reportsRequest.current !== requestId) return;
          setReports([]);
          setReportsError(errorMessage(err));
        })
        .finally(() => {
          if (reportsRequest.current === requestId) setReportsLoading(false);
        });
    }, 300);

    return () => window.clearTimeout(timer);
  }, [token, query]);

  const selectedReport = useMemo(
    () => reports.find((report) => report.id === selectedReportId) ?? null,
    [reports, selectedReportId],
  );

  const reportFilters = useMemo<FilterTree | null>(() => {
    if (!reportRun || reportRun.contact_ids.length === 0) return null;
    return {
      ...filters,
      contact: {
        ...filters.contact,
        contacts_cibles: reportRun.contact_ids,
      },
    };
  }, [filters, reportRun]);

  const inSessionOf = useMemo(
    () =>
      new Map(dedup.map((entry) => [entry.sf_contact_id, entry.in_session_of])),
    [dedup],
  );

  const eligibleIds = useMemo(() => {
    const dedupSet = new Set(dedup.map((entry) => entry.sf_contact_id));
    return new Set(
      preview
        .map((contact) => contact.sf_contact_id)
        .filter((id) => dedupMode !== 'exclure' || !dedupSet.has(id)),
    );
  }, [dedup, dedupMode, preview]);

  useEffect(() => {
    if (!token || !reportFilters || !reportRun) return;
    const requestId = previewRequest.current + 1;
    previewRequest.current = requestId;
    setPreviewLoading(true);
    setPreviewError(null);

    const timer = window.setTimeout(() => {
      void fetchContactList(token, reportFilters, {
        limit: contactLimit,
        maxPerCompany,
      })
        .then((data) => {
          if (previewRequest.current !== requestId) return;
          setPreview(data.contacts);
          setDedup(data.dedup);
          setExcludedCount(data.excluded_count ?? 0);
          setPreviewTruncated(data.truncated);
          if (data.contacts.length === 0) {
            setPreviewError(
              'Aucun contact du rapport ne correspond aux filtres.',
            );
          }
        })
        .catch((err) => {
          if (previewRequest.current !== requestId) return;
          setPreview([]);
          setDedup([]);
          setExcludedCount(0);
          setPreviewTruncated(false);
          setPreviewError(errorMessage(err));
        })
        .finally(() => {
          if (previewRequest.current === requestId) setPreviewLoading(false);
        });
    }, 300);

    return () => window.clearTimeout(timer);
  }, [contactLimit, maxPerCompany, reportFilters, reportRun, token]);

  // Changer la limite ou le cap/entreprise doit régénérer la sélection selon
  // le nouveau plafond (le refresh de preview re-déclenchera la sélection).
  useEffect(() => {
    hadPreviewRef.current = false;
  }, [contactLimit, maxPerCompany]);

  // Le premier résultat initialise la sélection selon le cap ; les refreshs
  // ne retirent que les contacts absents de la nouvelle preview.
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
          ? `Aperçu : max ${maxPerCompany}/entreprise, priorité aux postes décisionnaires.`
          : null,
      );
      return;
    }
    const previewIds = new Set(preview.map((contact) => contact.sf_contact_id));
    setSelectedIds((current) => {
      const next = new Set(
        [...current].filter((id) => previewIds.has(id) && eligibleIds.has(id)),
      );
      return next;
    });
  }, [contactLimit, eligibleIds, maxPerCompany, preview]);

  const selectedContacts = useMemo(
    () => preview.filter((contact) => selectedIds.has(contact.sf_contact_id)),
    [preview, selectedIds],
  );

  const packableAccounts = useMemo(() => {
    const grouped = new Map<string, ContactPreview[]>();
    for (const contact of selectedContacts) {
      const id = contact.sf_account_id || contact.sf_contact_id;
      const contacts = grouped.get(id) ?? [];
      contacts.push(contact);
      grouped.set(id, contacts);
    }
    return [...grouped.entries()].map(([id, contacts]) => ({
      id,
      name: contacts[0]?.account_name || 'Compte non renseigné',
      contacts,
    }));
  }, [selectedContacts]);

  const packedGroups = useMemo(
    () => packAccountsIntoSessions(packableAccounts, targetSize, maxSessions),
    [maxSessions, packableAccounts, targetSize],
  );
  const droppedAccounts = packedGroups.dropped;

  // Tous les contacts sélectionnés doivent être inclus. Si le nombre max de
  // séances (ou la taille) ne suffit pas, on augmente automatiquement le
  // nombre de séances — jamais de perte silencieuse.
  const droppedChangedRef = useRef(false);
  useEffect(() => {
    if (droppedAccounts.length === 0) return;
    if (droppedChangedRef.current) return;
    droppedChangedRef.current = true;
    setMaxSessions((current) => current + 1);
  }, [droppedAccounts.length]);
  useEffect(() => {
    droppedChangedRef.current = false;
  }, [maxSessions]);

  const activeFilters = useMemo(
    () => ({
      total:
        countEntrepriseFilters(filters.entreprise) +
        countContactFilters(filters.contact) +
        countRelanceFilters(filters.relance),
      secteurs: filters.entreprise.secteurs.length,
      effectifs: filters.entreprise.effectifs.length,
      typeClient: filters.entreprise.type_client.length,
      tiers: filters.entreprise.tiers.length,
      proprietaires: filters.entreprise.proprietaires.length,
    }),
    [filters],
  );

  const targetAccountsCount = useMemo(
    () =>
      new Set(
        selectedContacts.map(
          (contact) =>
            contact.sf_account_id || `contact:${contact.sf_contact_id}`,
        ),
      ).size,
    [selectedContacts],
  );

  const canProceedToStep1 = Boolean(
    reportRun && reportRun.contact_ids.length > 0,
  );
  const canProceedToStep2 = canProceedToStep1;
  const canProceedToStep3 = selectedContacts.length > 0;
  const canLaunchSession =
    Boolean(sessionName.trim()) && canProceedToStep3 && packedGroups.length > 0;

  const handleLoadReport = async (reportId: string) => {
    if (!reportId) return;
    setRunLoading(true);
    setRunError(null);
    setReportRun(null);
    setPreview([]);
    setPreviewError(null);
    setDedup([]);
    setExcludedCount(0);
    setPreviewTruncated(false);
    hadPreviewRef.current = false;
    try {
      const data = await fetchRunReport(token, reportId);
      setReportRun(data.run);
      if (data.run.contact_ids.length === 0) setRunError(NO_CONTACTS_ERROR);
      // Garde-fou : le backend rejette les listes > 2000 ids (SOQL_FETCH_CAP).
      if (data.run.contact_ids.length > 2000)
        setRunError(
          'Rapport trop large — affinez-le dans Salesforce puis rechargez.',
        );
    } catch (err) {
      setRunError(errorMessage(err));
    } finally {
      setRunLoading(false);
    }
  };

  const handleSelectReport = (reportId: string) => {
    setSelectedReportId(reportId);
    setReportRun(null);
    setRunError(null);
    setPreview([]);
    setPreviewError(null);
    setDedup([]);
    setExcludedCount(0);
    setPreviewTruncated(false);
    hadPreviewRef.current = false;
    void handleLoadReport(reportId);
  };

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
        ? `Sélection limitée à ${maxPerCompany}/entreprise (postes décisionnaires prioritaires).`
        : null,
    );
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
    setCapHint(null);
  };

  const handleFiltersChange = (next: FilterTree) => setFilters(next);

  const handleSavePreset = onSavePreset
    ? (name: string, shared: boolean) => void onSavePreset(name, shared)
    : undefined;

  const handleDeletePreset = onDeletePreset
    ? (id: number) => void onDeletePreset(id)
    : undefined;

  const handleCreateClick = () => {
    if (!canLaunchSession) return;
    onCreateAudience({
      groups: packedGroups.map((group) => ({
        account_ids: group.accountIds,
        contacts: group.contacts,
      })),
      targetSize,
      maxSessions,
      namePrefix: sessionName.trim(),
      excludedCount,
      scheduledFor: scheduledFor || undefined,
      sessionType,
    });
  };

  const handleNext = () => {
    if (step === 0 && canProceedToStep1) setStep(1);
    else if (step === 1 && canProceedToStep2) setStep(2);
    else if (step === 2 && canProceedToStep3) setStep(3);
    else if (step === 3 && canLaunchSession) handleCreateClick();
  };

  const handleStepChange = (next: ReportStep) => {
    if (next === 0) setStep(0);
    else if (next === 1 && canProceedToStep1) setStep(1);
    else if (next === 2 && canProceedToStep2) setStep(2);
    else if (next === 3 && canProceedToStep3) setStep(3);
  };

  const renderReportStep = () => (
    <div className="calls-wizard-step-pane" data-step="cibler">
      <GlassCard className="calls-report-selection">
        <div className="calls-report-selection__header">
          <div>
            <h3>Rapport Salesforce</h3>
            <p className="calls-muted">
              Sélectionnez un rapport pour récupérer ses contacts et comptes.
            </p>
          </div>
        </div>

        <label className="calls-field">
          <span>Rechercher un rapport</span>
          <input
            type="search"
            className="calls-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nom du rapport…"
            aria-label="Rechercher un rapport Salesforce"
          />
        </label>

        {reportsLoading && (
          <div
            className="calls-report-list calls-report-list--loading"
            role="status"
            aria-busy="true"
            aria-live="polite"
          >
            {[1, 2, 3].map((index) => (
              <div key={index} className="calls-report-option">
                <Skeleton width="1rem" height="1rem" />
                <span className="calls-report-option__body">
                  <Skeleton width="55%" height="1rem" />
                  <Skeleton width="35%" height="0.75rem" />
                </span>
              </div>
            ))}
            <p className="calls-muted">Recherche des rapports en cours…</p>
          </div>
        )}

        {!reportsLoading && reportsError && (
          <div className="calls-error" role="alert">
            <p>{reportsError}</p>
            <p className="calls-muted">Modifiez la recherche ou réessayez.</p>
          </div>
        )}

        {!reportsLoading && !reportsError && reports.length === 0 && (
          <EmptyState
            title={
              query.trim() ? 'Aucun rapport trouvé' : 'Aucun rapport disponible'
            }
            description={
              query.trim()
                ? 'Essayez un autre nom de rapport.'
                : 'Aucun rapport Salesforce n’est accessible avec cette connexion.'
            }
          />
        )}

        {!reportsLoading && !reportsError && reports.length > 0 && (
          <div
            className="calls-report-list"
            role="radiogroup"
            aria-label="Rapports Salesforce"
          >
            {reports.map((report) => {
              const checked = report.id === selectedReportId;
              return (
                <label
                  key={report.id}
                  className={`calls-report-option${checked ? ' calls-report-option--selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="salesforce-report"
                    value={report.id}
                    checked={checked}
                    aria-label={report.name}
                    onChange={() => handleSelectReport(report.id)}
                  />
                  <span className="calls-report-option__body">
                    <strong>{report.name}</strong>
                    <span className="calls-report-option__meta">
                      {report.folder_name || 'Dossier non renseigné'}
                      <span aria-hidden="true"> · </span>
                      Créé le : {formatActivityDateFr(report.created_date)}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        )}

        {runError && (
          <div
            className="calls-error calls-report-selection__error"
            role="alert"
          >
            <p>{runError}</p>
          </div>
        )}

        {reportRun && (
          <div
            className="calls-report-run"
            aria-label="Résumé du rapport chargé"
          >
            <div className="calls-report-run__header">
              <div>
                <h3>Résumé du rapport</h3>
                <p className="calls-muted">
                  {reportRun.report_name || selectedReport?.name}
                </p>
              </div>
              <Tag>
                {reportRun.row_count} ligne{reportRun.row_count > 1 ? 's' : ''}
              </Tag>
            </div>
            <dl className="calls-report-run__grid">
              <RunMetric
                label="Contacts exposés"
                value={reportRun.contact_ids.length}
              />
              <RunMetric
                label="Comptes exposés"
                value={reportRun.account_ids.length}
              />
              <RunMetric
                label="Contacts dupliqués"
                value={reportRun.duplicate_contact_count}
              />
              <RunMetric
                label="Comptes dupliqués"
                value={reportRun.duplicate_account_count}
              />
              <RunMetric
                label="Lignes inutilisables"
                value={reportRun.unusable_count}
              />
            </dl>
          </div>
        )}

        {reportRun?.truncated && (
          <div className="calls-truncated-banner" role="status">
            <p>Le run est tronqué : les résultats affichés sont partiels.</p>
          </div>
        )}

        {runLoading && <p className="calls-muted">Chargement du rapport…</p>}
      </GlassCard>
    </div>
  );

  const renderPreview = () => (
    <>
      <div
        className="calls-report-preview-summary"
        role="status"
        aria-live="polite"
      >
        <strong>{preview.length}</strong> contact
        {preview.length > 1 ? 's' : ''} du rapport retenu
        {preview.length > 1 ? 's' : ''} après filtres
      </div>

      {previewTruncated && (
        <GlassCard className="calls-truncated-banner" role="status">
          <p>Résultats partiels : affinez les filtres du rapport.</p>
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

      {previewError && !previewLoading && (
        <GlassCard className="calls-error">
          <p role="alert">{previewError}</p>
        </GlassCard>
      )}

      {preview.length > 0 && (
        <ContactPreviewCard
          preview={preview}
          selectedIds={selectedIds}
          selectedCount={selectedContacts.length}
          maxPerCompany={maxPerCompany}
          contactLimit={contactLimit}
          capHint={capHint}
          inSessionOf={inSessionOf}
          previewLoading={previewLoading}
          onToggle={toggleContact}
          onSelectAll={selectAll}
          onDeselectAll={deselectAll}
          onContactLimitChange={setContactLimit}
          onMaxPerCompanyChange={setMaxPerCompany}
        />
      )}

      {previewLoading && preview.length === 0 && (
        <GlassCard
          className="calls-empty calls-empty--hero"
          role="status"
          aria-live="polite"
        >
          <Tag variant="accent">Filtrage du rapport</Tag>
          <h3>Chargement des contacts…</h3>
          <Skeleton width="70%" height="0.9rem" />
          <Skeleton width="48%" height="0.9rem" />
        </GlassCard>
      )}

      {!previewLoading && preview.length === 0 && !previewError && (
        <EmptyState
          title="Aucun contact retenu"
          description="Aucun contact du rapport ne correspond aux filtres actuels. Ajustez-les pour continuer."
        />
      )}
    </>
  );

  const recapStep: ReportRecapStep =
    step < 2 ? 0 : step === 2 ? 1 : 2;
  const recapCtaLabel =
    step === 0
      ? 'Continuer vers Filtrer →'
      : step === 1
        ? 'Continuer vers Composer →'
        : step === 2
          ? 'Continuer vers Planifier →'
          : undefined;

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
        <ReportWizardStepper
          currentStep={step}
          onStepChange={handleStepChange}
          canProceedToStep1={canProceedToStep1}
          canProceedToStep2={canProceedToStep2}
          canProceedToStep3={canProceedToStep3}
        />
      </header>

      <div className="calls-wizard-layout">
        <main className="calls-wizard-main">
          {createError && (
            <GlassCard className="calls-error">
              <p role="alert" aria-live="assertive">
                {createError}
              </p>
            </GlassCard>
          )}

          {step === 0 && renderReportStep()}

          {step === 1 && (
            <div className="calls-wizard-step-pane" data-step="filtrer">
              <FilterBuilder
                filters={filters}
                onChange={handleFiltersChange}
                presets={presets}
                savingPreset={savingPreset}
                currentUserId={currentUserId}
                onLoadPreset={
                  onLoadPreset
                    ? (preset) => setFilters(normalizeFilterTree(preset.filters))
                    : () => {}
                }
                onSavePreset={(name, shared) =>
                  handleSavePreset?.(name, shared)
                }
                onDeletePreset={(id) => handleDeletePreset?.(id)}
                team={team}
              />
              <div className="calls-wizard-nav">
                <Button variant="secondary" onClick={() => setStep(0)}>
                  ← Précédent : Rapport
                </Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="calls-wizard-step-pane" data-step="composer">
              {renderPreview()}
              <div className="calls-wizard-nav">
                <Button variant="secondary" onClick={() => setStep(1)}>
                  ← Précédent : Filtrer
                </Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="calls-wizard-step-pane" data-step="planifier">
              <div className="calls-plan">
                <GlassCard className="calls-plan-card">
                  <h3 className="calls-plan-card__title">Informations</h3>
                  <div className="calls-plan-card__fields">
                    <label className="calls-field">
                      <span>Nom des séances (préfixe)</span>
                      <input
                        type="text"
                        className="calls-input"
                        value={sessionName}
                        onChange={(event) => setSessionName(event.target.value)}
                        placeholder="Ex. : Rapport prospects septembre"
                        aria-label="Nom des séances (préfixe)"
                      />
                    </label>
                    <DatePicker
                      label="Date de la séance"
                      value={scheduledFor}
                      onChange={setScheduledFor}
                    />
                    <SessionTypePicker
                      value={sessionType}
                      onChange={setSessionType}
                    />
                  </div>
                </GlassCard>

                <GlassCard className="calls-plan-card">
                  <h3 className="calls-plan-card__title">
                    Répartition des séances
                  </h3>
                  <div className="calls-plan-card__split-fields">
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
                        aria-label="Taille cible par séance"
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
                        aria-label="Nombre max de séances"
                      />
                    </label>
                  </div>
                  <p className="calls-muted calls-fb-hint" role="status">
                    Les contacts d&apos;un même compte restent ensemble.
                  </p>
                  {selectedContacts.length < (reportRun?.contact_ids.length ?? 0) && (
                    <div className="calls-warn-banner" role="alert">
                      {(reportRun?.contact_ids.length ?? 0) -
                        selectedContacts.length}{' '}
                      contact
                      {(reportRun?.contact_ids.length ?? 0) -
                        selectedContacts.length >
                      1
                        ? 's'
                        : ''}{' '}
                      du rapport non sélectionné
                      {(reportRun?.contact_ids.length ?? 0) -
                        selectedContacts.length >
                      1
                        ? 's'
                        : ''}{' '}
                      — ils ne seront pas inclus dans les séances.
                    </div>
                  )}
                  <div className="calls-abm-plan-groups">
                    {packedGroups.map((group, index) => (
                      <div
                        key={`${group.accountIds.join('-')}-${index}`}
                        className="calls-abm-plan-group-card"
                      >
                        <div className="calls-abm-plan-group-header">
                          <strong>Séance #{index + 1}</strong>
                          <span className="xos-numeric">
                            {group.totalContacts} contact
                            {group.totalContacts > 1 ? 's' : ''}
                          </span>
                        </div>
                        <p className="calls-muted">
                          {group.accountNames.join(', ')}
                        </p>
                      </div>
                    ))}
                  </div>
                </GlassCard>
              </div>

              <div className="calls-wizard-nav">
                <Button variant="secondary" onClick={() => setStep(1)}>
                  ← Précédent : Composer
                </Button>
              </div>
            </div>
          )}
        </main>

        <aside className="calls-abm-sidebar calls-wizard-sidebar">
          <AbmWizardRecap
            step={recapStep}
            nextCtaLabel={recapCtaLabel}
            composerSubStep="contacts"
            query={reportRun?.report_name || selectedReport?.name || ''}
            queryLabel="Rapport"
            ctaNoun="Rapport"
            exposedContactsCount={reportRun?.contact_ids.length ?? null}
            exposedAccountsCount={reportRun?.account_ids.length ?? null}
            planVisible={step >= 3}
            activeFiltersCount={activeFilters.total}
            secteursCount={activeFilters.secteurs}
            effectifsCount={activeFilters.effectifs}
            typeClientCount={activeFilters.typeClient}
            tiersCount={activeFilters.tiers}
            proprietairesCount={activeFilters.proprietaires}
            targetAccountsCount={targetAccountsCount}
            targetContactsCount={selectedContacts.length}
            sessionName={sessionName}
            scheduledFor={scheduledFor}
            sessionsCount={packedGroups.length}
            targetSize={targetSize}
            droppedAccountsCount={droppedAccounts.length}
            canProceedToStep2={canProceedToStep1}
            canProceedToStep3={canProceedToStep3}
            canLaunchSession={canLaunchSession}
            creating={creating}
            onNext={handleNext}
            onStepClick={(targetStep) => {
              if (targetStep === 0) setStep(1);
              else if (targetStep === 1) setStep(2);
              else if (targetStep === 2) setStep(3);
            }}
          />
        </aside>
      </div>
    </div>
  );
}
