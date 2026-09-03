import type { ReactNode } from 'react';
import { Button, GlassCard, Tag } from '../../../../components/ui';
import type { FilterTree } from '../../../../crm';
import {
  countContactFilters,
  countEntrepriseFilters,
  countRelanceFilters,
} from '../../filterCounts';
import { formatIsoDateFr } from '../../formControls.helpers';
import type { SessionType } from '../../types';
import type { WizardStep } from './WizardStepper';

export type WizardRecapProps = {
  step: WizardStep;
  filters: FilterTree;
  matchCount: number | null;
  matchCountCapped: boolean;
  matchCountLoading: boolean;
  previewCount: number;
  selectedCount: number;
  sessionName: string;
  scheduledFor: string;
  sessionType: SessionType;
  shareMemberCount: number;
  splitSessions: boolean;
  packedSessionsCount: number;
  onStepClick?: (step: WizardStep) => void;
  className?: string;
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

export function WizardRecap({
  step,
  filters,
  matchCount,
  matchCountCapped,
  matchCountLoading,
  previewCount,
  selectedCount,
  sessionName,
  scheduledFor,
  sessionType,
  shareMemberCount,
  splitSessions,
  packedSessionsCount,
  onStepClick,
  className = '',
}: WizardRecapProps) {
  const entrepriseCount = countEntrepriseFilters(filters.entreprise);
  const contactCount = countContactFilters(filters.contact);
  const relanceCount = countRelanceFilters(filters.relance);
  const totalFiltersCount = entrepriseCount + contactCount + relanceCount;

  const sessionTypeLabel =
    sessionType === 'prospection'
      ? 'Prospection'
      : sessionType === 'relance'
        ? 'Relance'
        : 'Mixte';

  return (
    <GlassCard
      className={['calls-wizard-recap', className].filter(Boolean).join(' ')}
    >
      <div className="calls-wizard-recap__header">
        <h3 className="calls-wizard-recap__title">Votre sélection</h3>
        <Tag variant="accent">Étape {step + 1} / 3</Tag>
      </div>

      {/* Section 1 : Cible */}
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
          <div className="calls-wizard-recap__item">
            <span className="calls-wizard-recap__item-label">Filtres actifs</span>
            <span className="calls-wizard-recap__item-value xos-numeric">
              {totalFiltersCount}
            </span>
          </div>
          {totalFiltersCount > 0 && (
            <div className="calls-wizard-recap__subitems">
              <span className="calls-wizard-recap__subitem">
                Entreprise : <strong>{entrepriseCount}</strong>
              </span>
              <span className="calls-wizard-recap__subitem">
                Contact : <strong>{contactCount}</strong>
              </span>
              <span className="calls-wizard-recap__subitem">
                Relance : <strong>{relanceCount}</strong>
              </span>
            </div>
          )}
        </div>
      </section>

      {/* Section 2 : Résultat & Sélection */}
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
            <span className="calls-wizard-recap__item-label">Contacts ciblés</span>
            <span className="calls-wizard-recap__item-value xos-numeric">
              {matchCountLoading
                ? 'Comptage…'
                : matchCount !== null
                  ? `${matchCountCapped ? '≥ ' : ''}${matchCount}`
                  : previewCount > 0
                    ? previewCount
                    : '—'}
            </span>
          </div>
          <div className="calls-wizard-recap__item">
            <span className="calls-wizard-recap__item-label">Sélectionnés</span>
            <span className="calls-wizard-recap__item-value xos-numeric">
              <strong>{selectedCount}</strong>
              {previewCount > 0 ? ` / ${previewCount}` : ''}
            </span>
          </div>
        </div>
      </section>

      {/* Section 3 : Planification */}
      <section
        className="calls-wizard-recap__section"
        aria-label="Détails de planification"
      >
        <div className="calls-wizard-recap__section-header">
          <span className="calls-wizard-recap__section-title">Planification</span>
        </div>
        <div className="calls-wizard-recap__breakdown">
          <div className="calls-wizard-recap__item">
            <span className="calls-wizard-recap__item-label">Nom</span>
            <span
              className="calls-wizard-recap__item-value calls-wizard-recap__item-value--truncate"
              title={sessionName.trim() || undefined}
            >
              {sessionName.trim() || '—'}
            </span>
          </div>
          <div className="calls-wizard-recap__item">
            <span className="calls-wizard-recap__item-label">Date</span>
            <span className="calls-wizard-recap__item-value">
              {formatIsoDateFr(scheduledFor)}
            </span>
          </div>
          <div className="calls-wizard-recap__item">
            <span className="calls-wizard-recap__item-label">Type</span>
            <span className="calls-wizard-recap__item-value">
              {sessionTypeLabel}
            </span>
          </div>
          <div className="calls-wizard-recap__item">
            <span className="calls-wizard-recap__item-label">Partage</span>
            <span className="calls-wizard-recap__item-value">
              {shareMemberCount > 0
                ? `${shareMemberCount} collègue${shareMemberCount > 1 ? 's' : ''}`
                : 'Personnel'}
            </span>
          </div>
          {splitSessions && (
            <div className="calls-wizard-recap__item">
              <span className="calls-wizard-recap__item-label">Découpe</span>
              <span className="calls-wizard-recap__item-value">
                {packedSessionsCount} séance{packedSessionsCount > 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>
      </section>
    </GlassCard>
  );
}
