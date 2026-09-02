import type { KeyboardEvent } from 'react';
import { Button, GlassCard, Tag } from '../../../../components/ui';

export type SessionTypeSelectProps = {
  onBack: () => void;
  onSelectClassic: () => void;
  onSelectAbm: () => void;
  onSelectCsv: () => void;
  onSelectSurgical: () => void;
};

export function SessionTypeSelect({
  onBack,
  onSelectClassic,
  onSelectAbm,
}: SessionTypeSelectProps) {
  const handleKeyDown = (
    e: KeyboardEvent<HTMLDivElement>,
    action: () => void,
  ) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      action();
    }
  };

  return (
    <div className="calls-view calls-session-type-select">
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
            <h2>Choisir le type de séance</h2>
          </div>
        </div>
      </header>

      <div className="calls-session-type-grid">
        {/* Card 1 — "Liste classique" (hero bento, span 2) */}
        <GlassCard
          className="calls-session-type-card calls-session-type-card--hero"
          role="button"
          tabIndex={0}
          onClick={onSelectClassic}
          onKeyDown={(e) => handleKeyDown(e, onSelectClassic)}
          aria-label="Liste classique — Composer une liste de contacts depuis Salesforce avec des filtres"
        >
          <div className="calls-session-type-card__icon" aria-hidden="true">
            📋
          </div>
          <div className="calls-session-type-card__content">
            <h3 className="calls-session-type-card__title">Liste classique</h3>
            <p className="calls-session-type-card__desc">
              Composer une liste de contacts depuis Salesforce avec des filtres
            </p>
          </div>
        </GlassCard>

        {/* Card 2 — "Séance ABM" */}
        <GlassCard
          className="calls-session-type-card"
          role="button"
          tabIndex={0}
          onClick={onSelectAbm}
          onKeyDown={(e) => handleKeyDown(e, onSelectAbm)}
          aria-label="Comptes précis (ABM) — Cibler des comptes spécifiques et leurs contacts décisionnaires"
        >
          <div className="calls-session-type-card__icon" aria-hidden="true">
            🎯
          </div>
          <div className="calls-session-type-card__content">
            <h3 className="calls-session-type-card__title">
              Comptes précis (ABM)
            </h3>
            <p className="calls-session-type-card__desc">
              Cibler des comptes spécifiques et leurs contacts décisionnaires
            </p>
          </div>
        </GlassCard>

        {/* Card 3 — "Import CSV" (bento, span 1) */}
        <GlassCard
          className="calls-session-type-card calls-session-type-card--disabled"
          role="button"
          aria-disabled="true"
          tabIndex={-1}
          aria-label="Import CSV — Bientôt disponible — Importer une liste de contacts depuis un fichier CSV"
        >
          <div className="calls-session-type-card__header">
            <div className="calls-session-type-card__icon" aria-hidden="true">
              📄
            </div>
            <Tag variant="muted">Bientôt</Tag>
          </div>
          <div className="calls-session-type-card__content">
            <h3 className="calls-session-type-card__title">Import CSV</h3>
            <p className="calls-session-type-card__desc">
              Importer une liste de contacts depuis un fichier CSV
            </p>
          </div>
        </GlassCard>

        {/* Card 4 — "Séance chirurgicale" (bento, span 2) */}
        <GlassCard
          className="calls-session-type-card calls-session-type-card--disabled calls-session-type-card--wide"
          role="button"
          aria-disabled="true"
          tabIndex={-1}
          aria-label="Séance chirurgicale — Bientôt disponible — Ajouter individuellement des contacts par recherche nom ou email"
        >
          <div className="calls-session-type-card__header">
            <div className="calls-session-type-card__icon" aria-hidden="true">
              🔬
            </div>
            <Tag variant="muted">Bientôt</Tag>
          </div>
          <div className="calls-session-type-card__content">
            <h3 className="calls-session-type-card__title">
              Séance chirurgicale
            </h3>
            <p className="calls-session-type-card__desc">
              Ajouter individuellement des contacts, recherche par nom ou email
            </p>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
