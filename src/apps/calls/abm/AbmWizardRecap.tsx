import type { ReactNode } from 'react';
import { Button, GlassCard } from '../../../components/ui';
import { formatIsoDateFr } from '../formControls.helpers';
import type { WizardStep } from '../modules/sessions/WizardStepper';

export type AbmWizardRecapProps = {
  step: WizardStep;
  searchMode?: 'name' | 'filters' | null;
  matchAccountsCount?: number | null;
  matchAccountsCapped?: boolean;
  composerSubStep?: 'accounts' | 'contacts';
  query: string;
  activeFiltersCount: number;
  secteursCount: number;
  effectifsCount: number;
  typeClientCount: number;
  tiersCount: number;
  proprietairesCount: number;
  targetAccountsCount: number;
  targetContactsCount: number;
  sessionName: string;
  scheduledFor: string;
  sessionsCount: number;
  targetSize: number;
  droppedAccountsCount: number;
  canProceedToStep2: boolean;
  canProceedToStep3: boolean;
  canLaunchSession: boolean;
  creating: boolean;
  onNext: () => void;
  onStepClick?: (step: WizardStep) => void;
  className?: string;
  /** Nom du mode affiché dans le CTA final (défaut : ABM). */
  ctaNoun?: string;
  /** Libellé de la ligne de requête/source (défaut : Recherche). */
  queryLabel?: string;
  /** Libellé personnalisé du CTA de progression. */
  nextCtaLabel?: string;
};

function EditStepIcon(): ReactNode {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

export function AbmWizardRecap({
  step,
  searchMode = null,
  matchAccountsCount = null,
  matchAccountsCapped = false,
  composerSubStep = 'accounts',
  query,
  activeFiltersCount,
  secteursCount,
  effectifsCount,
  typeClientCount,
  tiersCount,
  proprietairesCount,
  targetAccountsCount,
  targetContactsCount,
  sessionName,
  scheduledFor,
  sessionsCount,
  targetSize,
  droppedAccountsCount,
  canProceedToStep2,
  canProceedToStep3,
  canLaunchSession,
  creating,
  onNext,
  onStepClick,
  className = '',
  ctaNoun = 'ABM',
  queryLabel = 'Recherche',
  nextCtaLabel,
}: AbmWizardRecapProps) {
  const computedNextCtaLabel =
    step === 0
      ? 'Continuer vers Composer →'
      : step === 1
        ? composerSubStep === 'accounts'
          ? 'Continuer vers les contacts →'
          : 'Continuer vers Planifier →'
        : creating
          ? 'Création en cours…'
            : sessionsCount > 0
              ? `Créer ${sessionsCount} séance${sessionsCount > 1 ? 's' : ''} ${ctaNoun}`
              : `Créer séance ${ctaNoun}`;
  const visibleCtaLabel = nextCtaLabel ?? computedNextCtaLabel;

  const nextDisabled =
    step === 0
      ? !canProceedToStep2
      : step === 1
        ? !canProceedToStep3
        : !canLaunchSession || creating;

  return (
    <GlassCard
      className={['calls-wizard-recap', className].filter(Boolean).join(' ')}
    >
      <div className="calls-wizard-recap__header">
        <h3 className="calls-wizard-recap__title">Votre sélection</h3>
      </div>

      {/* Section 1 : Cible (Filtres & Recherche) */}
      <section className="calls-wizard-recap__section" aria-label="Filtres cibles">
        <div className="calls-wizard-recap__section-header">
          <span className="calls-wizard-recap__section-title">Cible</span>
          {step > 0 && onStepClick && (
            <Button
              variant="ghost"
              size="sm"
              className="calls-wizard-recap__edit-btn"
              onClick={() => onStepClick(0)}
              aria-label="Modifier les filtres cibles (retour étape 1)"
            >
              <EditStepIcon />
              <span>Modifier</span>
            </Button>
          )}
        </div>
        <div className="calls-wizard-recap__breakdown">
          {query.trim() ? (
            <div className="calls-wizard-recap__item">
              <span className="calls-wizard-recap__item-label">{queryLabel}</span>
              <span
                className="calls-wizard-recap__item-value calls-wizard-recap__item-value--truncate"
                title={query}
              >
                « {query} »
              </span>
            </div>
          ) : null}
          <div className="calls-wizard-recap__item">
            <span className="calls-wizard-recap__item-label">Filtres actifs</span>
            <span className="calls-wizard-recap__item-value xos-numeric">
              {activeFiltersCount}
            </span>
          </div>
          {searchMode === 'filters' && matchAccountsCount !== undefined && matchAccountsCount !== null && (
            <div className="calls-wizard-recap__item calls-wizard-recap__item--matches">
              <span className="calls-wizard-recap__item-label">
                {matchAccountsCapped ? '≥ ' : ''}{matchAccountsCount} compte{matchAccountsCount > 1 ? 's' : ''} ciblé{matchAccountsCount > 1 ? 's' : ''}
              </span>
            </div>
          )}
          {activeFiltersCount > 0 && (
            <div className="calls-wizard-recap__subitems">
              {secteursCount > 0 && (
                <span className="calls-wizard-recap__subitem">
                  Secteur{secteursCount > 1 ? 's' : ''} : <strong>{secteursCount}</strong>
                </span>
              )}
              {effectifsCount > 0 && (
                <span className="calls-wizard-recap__subitem">
                  Effectif{effectifsCount > 1 ? 's' : ''} : <strong>{effectifsCount}</strong>
                </span>
              )}
              {typeClientCount > 0 && (
                <span className="calls-wizard-recap__subitem">
                  Type : <strong>{typeClientCount}</strong>
                </span>
              )}
              {tiersCount > 0 && (
                <span className="calls-wizard-recap__subitem">
                  Tier{tiersCount > 1 ? 's' : ''} : <strong>{tiersCount}</strong>
                </span>
              )}
              {proprietairesCount > 0 && (
                <span className="calls-wizard-recap__subitem">
                  Propriétaire{proprietairesCount > 1 ? 's' : ''} : <strong>{proprietairesCount}</strong>
                </span>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Section 2 : Audience (Comptes & Contacts) */}
      <section
        className="calls-wizard-recap__section"
        aria-label="Résultats et sélection"
      >
        <div className="calls-wizard-recap__section-header">
          <span className="calls-wizard-recap__section-title">Audience</span>
          {step > 1 && onStepClick && (
            <Button
              variant="ghost"
              size="sm"
              className="calls-wizard-recap__edit-btn"
              onClick={() => onStepClick(1)}
              aria-label="Modifier la sélection (retour étape 2)"
            >
              <EditStepIcon />
              <span>Modifier</span>
            </Button>
          )}
        </div>
        <div className="calls-wizard-recap__breakdown">
          <div className="calls-wizard-recap__item">
            <span className="calls-wizard-recap__item-label">Comptes ciblés</span>
            <span className="calls-wizard-recap__item-value xos-numeric">
              {targetAccountsCount}
            </span>
          </div>
          <div className="calls-wizard-recap__item">
            <span className="calls-wizard-recap__item-label">Contacts retenus</span>
            <span className="calls-wizard-recap__item-value xos-numeric">
              {targetContactsCount}
            </span>
          </div>
        </div>
      </section>

      {/* Section 3 : Planification */}
      <section className="calls-wizard-recap__section" aria-label="Planification">
        <div className="calls-wizard-recap__section-header">
          <span className="calls-wizard-recap__section-title">Planification</span>
        </div>
        <div className="calls-wizard-recap__breakdown">
          <div className="calls-wizard-recap__item">
            <span className="calls-wizard-recap__item-label">Aperçu</span>
            <span className="calls-wizard-recap__item-value xos-numeric">
              {sessionsCount > 0
                ? `${sessionsCount} séance${sessionsCount > 1 ? 's' : ''}`
                : '—'}
            </span>
          </div>
          <div className="calls-wizard-recap__item">
            <span className="calls-wizard-recap__item-label">Contacts / séance</span>
            <span className="calls-wizard-recap__item-value xos-numeric">
              {targetSize}
            </span>
          </div>
          {sessionName.trim() && (
            <div className="calls-wizard-recap__item">
              <span className="calls-wizard-recap__item-label">Préfixe</span>
              <span
                className="calls-wizard-recap__item-value calls-wizard-recap__item-value--truncate"
                title={sessionName}
              >
                {sessionName}
              </span>
            </div>
          )}
          {scheduledFor && (
            <div className="calls-wizard-recap__item">
              <span className="calls-wizard-recap__item-label">Date</span>
              <span className="calls-wizard-recap__item-value">
                {formatIsoDateFr(scheduledFor)}
              </span>
            </div>
          )}
          {droppedAccountsCount > 0 && (
            <div className="calls-wizard-recap__item calls-wizard-recap__item--warn">
              <span className="calls-wizard-recap__item-label">
                Comptes écartés
              </span>
              <span className="calls-wizard-recap__item-value xos-numeric">
                {droppedAccountsCount}
              </span>
            </div>
          )}
        </div>
      </section>

      {/* CTA principal unique sous les stats */}
      <div className="calls-wizard-recap__cta">
        <Button
          className="calls-wizard-recap__cta-btn"
          onClick={onNext}
          disabled={nextDisabled}
        >
          {visibleCtaLabel}
        </Button>
      </div>
    </GlassCard>
  );
}
