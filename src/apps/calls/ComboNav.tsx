import { Button } from '../../components/ui';

export type ComboNavView =
  'sessions' | 'calendar' | 'recalls' | 'rdv-suivi' | 'pilotage';

type ComboNavProps = {
  activeView: ComboNavView;
  recallCount: number;
  recallsLoading?: boolean;
  canPilotage?: boolean;
  onNavigate: (view: ComboNavView) => void;
};

type ComboNavIconName =
  'sessions' | 'calendar' | 'recalls' | 'rdv-suivi' | 'pilotage';

function ComboNavIcon({ name }: { name: ComboNavIconName }) {
  if (name === 'sessions') {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
        <path d="M4 4.5h12v11H4z" />
        <path d="M7 2.5v4M13 2.5v4M4 8h12" />
        <path d="m7 11 1.2 1.2L10.5 10M12 11h2" />
      </svg>
    );
  }
  if (name === 'calendar') {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
        <rect x="3.5" y="4.5" width="13" height="12" rx="1.5" />
        <path d="M6.5 2.5v4M13.5 2.5v4M3.5 8h13M7 11h.01M10 11h.01M13 11h.01M7 14h.01M10 14h.01" />
      </svg>
    );
  }
  if (name === 'recalls') {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
        <path d="M15.5 8a5.5 5.5 0 0 0-10.8-1.5" />
        <path d="M4 3.5v3.5h3.5M4.5 12a5.5 5.5 0 0 0 10.8 1.5" />
        <path d="M16 16.5V13h-3.5" />
      </svg>
    );
  }
  if (name === 'rdv-suivi') {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
        <path d="M3.5 5.5h13v10h-13zM6.5 3v5M13.5 3v5M3.5 9h13" />
        <path d="m7 12 1.4 1.4 3-3M12.5 14h1.5" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M3.5 15.5h13M5 13V9M9 13V5M13 13V7M17 13V3" />
      <path d="m4 7 4-3 4 2 4-3" />
    </svg>
  );
}

function NavItem({
  view,
  label,
  activeView,
  onNavigate,
  badge,
  badgeLabel,
}: {
  view: ComboNavView;
  label: string;
  activeView: ComboNavView;
  onNavigate: (view: ComboNavView) => void;
  badge?: string;
  badgeLabel?: string;
}) {
  const active = activeView === view;
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={`calls-nav__item${active ? ' calls-nav__item--active' : ''}`}
      aria-current={active ? 'page' : undefined}
      onClick={() => onNavigate(view)}
    >
      <ComboNavIcon name={view} />
      <span>{label}</span>
      {badge ? (
        <span className="calls-nav__badge" aria-label={badgeLabel}>
          {badge}
        </span>
      ) : null}
    </Button>
  );
}

export function ComboNav({
  activeView,
  recallCount,
  recallsLoading = false,
  canPilotage = false,
  onNavigate,
}: ComboNavProps) {
  return (
    <nav className="calls-nav" aria-label="Navigation Combo">
      <div className="calls-nav__group" role="group" aria-label="Travail">
        <span className="calls-nav__group-label">Travail</span>
        <div className="calls-nav__items">
          <NavItem
            view="sessions"
            label="Séances"
            activeView={activeView}
            onNavigate={onNavigate}
          />
          <NavItem
            view="calendar"
            label="Calendrier"
            activeView={activeView}
            onNavigate={onNavigate}
          />
          <NavItem
            view="recalls"
            label="Rappels"
            activeView={activeView}
            onNavigate={onNavigate}
            badge={
              recallsLoading
                ? '…'
                : recallCount > 0
                  ? String(recallCount)
                  : undefined
            }
            badgeLabel={
              recallsLoading
                ? 'Chargement des rappels'
                : `${recallCount} rappel${recallCount > 1 ? 's' : ''}`
            }
          />
          <NavItem
            view="rdv-suivi"
            label="Suivi RDV"
            activeView={activeView}
            onNavigate={onNavigate}
          />
        </div>
      </div>
      {canPilotage ? (
        <div className="calls-nav__group" role="group" aria-label="Pilotage">
          <span className="calls-nav__group-label">Pilotage</span>
          <div className="calls-nav__items">
            <NavItem
              view="pilotage"
              label="Pilotage"
              activeView={activeView}
              onNavigate={onNavigate}
            />
          </div>
        </div>
      ) : null}
    </nav>
  );
}
