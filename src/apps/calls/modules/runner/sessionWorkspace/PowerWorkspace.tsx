import { Button, GlassCard, Tag } from '../../../../../components/ui';
import type { PowerUiState, ProjectedPowerQueue } from './types';

export interface PowerWorkspaceProps {
  isPowerActive: boolean;
  powerUiState: PowerUiState;
  projectedQueue?: ProjectedPowerQueue | null;
  onTogglePower?: () => void;
  canPowerDialer?: boolean;
  isSheet?: boolean;
  onCloseSheet?: () => void;
}

export function PowerWorkspace({
  isPowerActive,
  powerUiState,
  projectedQueue,
  onTogglePower,
  canPowerDialer = false,
  isSheet = false,
  onCloseSheet,
}: PowerWorkspaceProps) {
  // Replié pendant une conversation ou en phase ACW (Plan §1 & Grok note b)
  if (powerUiState === 'conversation' || powerUiState === 'acw') {
    return null;
  }

  const readyCount = projectedQueue?.readyCount ?? 0;

  return (
    <aside
      className={`calls-workspace__power ${isSheet ? 'calls-workspace__power--sheet' : ''}`}
      role="region"
      aria-label="Console Power"
    >
      <div className="calls-workspace__power-header">
        <div className="calls-workspace__power-title-group">
          <h3 className="calls-workspace__power-title">Console Power</h3>
          <Tag
            variant={
              powerUiState === 'wave'
                ? 'warning'
                : powerUiState === 'ready'
                  ? 'accent'
                  : 'muted'
            }
          >
            {powerUiState}
          </Tag>
        </div>

        {isSheet && onCloseSheet && (
          <Button
            variant="ghost"
            size="sm"
            className="calls-workspace__power-close"
            onClick={onCloseSheet}
            aria-label="Fermer la console Power"
          >
            ✕
          </Button>
        )}
      </div>

      <GlassCard className="calls-workspace__power-card">
        {!canPowerDialer ? (
          <p className="calls-muted">
            Le mode Power n&apos;est pas disponible pour cette séance.
          </p>
        ) : !isPowerActive ? (
          <div className="calls-workspace__power-off">
            <p className="calls-muted">
              Le mode Power permet la numérotation automatique en parallèle.
            </p>
            {onTogglePower && (
              <Button
                variant="secondary"
                size="md"
                onClick={onTogglePower}
                className="calls-workspace__power-toggle-btn"
              >
                Activer le mode Power
              </Button>
            )}
          </div>
        ) : (
          <div className="calls-workspace__power-active">
            <div className="calls-workspace__power-stats">
              <span className="calls-workspace__power-stat-label">
                Numéros prêts
              </span>
              <strong className="calls-workspace__power-stat-val xos-numeric">
                {readyCount}
              </strong>
            </div>

            <div className="calls-workspace__power-placeholder-actions">
              {powerUiState === 'ready' && (
                <Button
                  variant="primary"
                  size="md"
                  disabled
                  className="calls-workspace__power-cta"
                  title="Machine Power intégrée au lot L4"
                >
                  Lancer ({readyCount})
                </Button>
              )}

              {powerUiState === 'wave' && (
                <Button
                  variant="danger"
                  size="md"
                  disabled
                  className="calls-workspace__power-cta"
                >
                  Raccrocher tout
                </Button>
              )}

              {powerUiState === 'hangupRetry' && (
                <Button
                  variant="danger"
                  size="md"
                  disabled
                  className="calls-workspace__power-cta"
                >
                  Réessayer le raccrochage
                </Button>
              )}

              {onTogglePower && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onTogglePower}
                  className="calls-workspace__power-deactivate"
                >
                  Désactiver Power
                </Button>
              )}
            </div>
          </div>
        )}
      </GlassCard>
    </aside>
  );
}
