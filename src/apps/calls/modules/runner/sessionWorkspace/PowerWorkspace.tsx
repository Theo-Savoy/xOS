import { Button, GlassCard, Select, Tag } from '../../../../../components/ui';
import type { SessionContact } from '../../../types';
import type { PoolLine } from '../../dialer/domain/PoolState';
import type { PowerUiState, ProjectedPowerQueue } from './types';

const LINE_LABEL: Record<string, string> = {
  dialing: 'compose',
  ringing: 'sonne',
  connected: 'en ligne',
  ended: 'terminé',
  skipped: 'sans réponse',
  failed: 'échec',
};

function formatFr(e164: string): string {
  const national = e164.startsWith('+33') ? e164.slice(3) : null;
  if (!national || national.length !== 9) return e164;
  return `+33 ${national[0]} ${national.slice(1).replace(/(\d{2})(?=\d)/g, '$1 ')}`;
}

export interface PowerWorkspaceProps {
  isPowerActive: boolean;
  powerUiState: PowerUiState;
  projectedQueue?: ProjectedPowerQueue | null;
  canPowerDialer?: boolean;
  onTogglePower?: () => void;
  parallelism?: number;
  onParallelismChange?: (p: number) => void;
  callerNumber?: string;
  onCallerNumberChange?: (n: string) => void;
  callerNumbers?: Array<{ e164: string; label?: string | null }>;
  quota?: {
    used: number;
    limit: number | null;
    remaining: number | null;
    blocked: boolean;
    constrained: boolean;
  };
  lines?: PoolLine[];
  byPhone?: Map<string, SessionContact>;
  error?: string | null;
  launching?: boolean;
  hasAttempted?: boolean;
  onLaunch?: () => void;
  onHangupAll?: () => void;
  onSkip?: (slot: number) => void;
  onRetryHangup?: () => void;
  isSheet?: boolean;
  onCloseSheet?: () => void;
}

export function PowerWorkspace({
  isPowerActive,
  powerUiState,
  projectedQueue,
  canPowerDialer = false,
  onTogglePower,
  parallelism = 3,
  onParallelismChange,
  callerNumber = '',
  onCallerNumberChange,
  callerNumbers = [],
  quota,
  lines = [],
  byPhone = new Map(),
  error = null,
  launching = false,
  hasAttempted = false,
  onLaunch,
  onHangupAll,
  onSkip,
  onRetryHangup,
  isSheet = false,
  onCloseSheet,
}: PowerWorkspaceProps) {
  // Replié pendant une conversation ou en phase ACW (Plan §1 & Grok note b)
  if (powerUiState === 'conversation' || powerUiState === 'acw') {
    return null;
  }

  const readyCount = projectedQueue?.readyCount ?? 0;
  const unreachableCount = projectedQueue?.unreachableCount ?? 0;
  // Nombre réellement lancé par la vague = min(file prête, parallélisme) — libellé CTA unique
  const launchCount = Math.min(readyCount, parallelism);
  const activeLines = lines.filter((l) => l.phase !== 'idle');

  return (
    <aside
      className={`calls-workspace__power ${isSheet ? 'calls-workspace__power--sheet' : ''}`}
      role="region"
      aria-label="Console Power"
    >
      {/* Élément audio RTC déplacé dans SessionWorkspaceV2 (correctif B1 Opus) —
          instance unique, toujours montée tant que Power est actif */}

      <div className="calls-workspace__power-header">
        <div className="calls-workspace__power-title-group">
          <h3 className="calls-workspace__power-title">Console Power</h3>
          <Tag
            variant={
              powerUiState === 'wave'
                ? 'warning'
                : powerUiState === 'ready'
                  ? 'accent'
                  : powerUiState === 'hangupRetry'
                    ? 'alert'
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

      <GlassCard className={`calls-workspace__power-card${launching ? ' calls-power-strip--launching' : ''}`}>
        {!canPowerDialer ? (
          <p className="calls-muted">
            Le mode Power n&apos;est pas disponible pour cette séance.
          </p>
        ) : !isPowerActive || powerUiState === 'off' ? (
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
            {/* 1. Résumé de file Power */}
            <div className="calls-workspace__power-stats">
              <span className="calls-workspace__power-stat-label">
                File d&apos;appel ·{' '}
                <strong className="calls-workspace__power-stat-val xos-numeric">
                  {readyCount}
                </strong>{' '}
                prêt{readyCount > 1 ? 's' : ''}
                {unreachableCount > 0 && (
                  <> · <span className="xos-numeric">{unreachableCount}</span> sans numéro valide</>
                )}
              </span>

              {/* Quota quotidien si contraint (Plan §2 : quota si remaining < 8) */}
              {quota?.constrained && quota.limit !== null && (
                <span
                  className={`calls-power-strip__quota${quota.blocked ? ' calls-power-strip__quota--blocked' : ''}`}
                  title="Compositions décomptées du quota quotidien"
                >
                  <strong className="xos-numeric">
                    {quota.used}/{quota.limit}
                  </strong>{' '}
                  appels aujourd&apos;hui
                </span>
              )}
            </div>

            {/* 2. Réglages de composition : UNIQUEMENT visibles en ready, verrouillés en wave (Plan §2) */}
            {powerUiState === 'ready' && (
              <div className="calls-workspace__power-settings">
                {onParallelismChange && (
                  <Select
                    className="calls-power-strip__select calls-power-strip__select--lines"
                    label={`${parallelism} simultané${parallelism > 1 ? 's' : ''}`}
                    aria-label="Appels en parallèle"
                    value={String(parallelism)}
                    onChange={(val) => onParallelismChange(Number(val))}
                    options={[1, 2, 3, 4, 5].map((count) => ({
                      value: String(count),
                      label: `${count} simultané${count > 1 ? 's' : ''}`,
                    }))}
                  />
                )}

                {callerNumbers.length > 1 && onCallerNumberChange && (
                  <Select
                    className="calls-power-strip__select calls-power-strip__select--caller"
                    label="Appeler depuis"
                    aria-label="Numéro sortant"
                    value={callerNumber}
                    onChange={onCallerNumberChange}
                    options={callerNumbers.map((number) => ({
                      value: number.e164,
                      label: number.label
                        ? `${number.label} · ${formatFr(number.e164)}`
                        : formatFr(number.e164),
                    }))}
                    renderValue={(selected) =>
                      selected[0]
                        ? (callerNumbers.find((n) => n.e164 === selected[0].value)?.label ??
                            formatFr(selected[0].value))
                        : '—'
                    }
                  />
                )}
              </div>
            )}

            {/* 3. Lignes actives en cours de vague */}
            {activeLines.length > 0 && (
              <div
                className="calls-power-strip__lines"
                role="status"
                aria-live="polite"
              >
                {activeLines.map((line) => (
                  <span
                    key={line.slot}
                    className={`calls-power-strip__line calls-power-strip__line--${line.phase}`}
                  >
                    <span className="calls-power-strip__line-name">
                      {byPhone.get(line.destination)?.contact_name ?? line.destination}
                    </span>
                    <span className="calls-power-strip__line-phase">
                      {LINE_LABEL[line.phase] ?? line.phase}
                    </span>
                    {['dialing', 'ringing'].includes(line.phase) && onSkip && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onSkip(line.slot)}
                      >
                        Passer
                      </Button>
                    )}
                  </span>
                ))}
              </div>
            )}

            {/* 4. Erreur opérationnelle éventuelle */}
            {error && (
              <p className="calls-dialer__error" role="alert">
                {error}
              </p>
            )}

            {/* 5. Actions selon l'état de la machine */}
            <div className="calls-workspace__power-actions">
              {/* État READY : Lancer N appels / Relancer */}
              {powerUiState === 'ready' && onLaunch && (
                <Button
                  variant="primary"
                  size="md"
                  className="calls-workspace__power-cta"
                  onClick={onLaunch}
                  disabled={readyCount === 0 || quota?.blocked}
                  title={
                    quota?.blocked
                      ? "Limite d'appels du jour atteinte"
                      : readyCount === 0
                        ? 'Aucun contact composable dans cette séance'
                        : undefined
                  }
                >
                  <span aria-hidden="true">▶ </span>
                  {hasAttempted ? 'Relancer' : `Lancer ${launchCount} appel${launchCount > 1 ? 's' : ''}`}
                </Button>
              )}

              {/* État WAVE : Raccrocher tout (panel Power uniquement, jamais header) */}
              {powerUiState === 'wave' && onHangupAll && (
                <Button
                  variant="danger"
                  size="md"
                  className="calls-workspace__power-cta"
                  onClick={onHangupAll}
                >
                  Raccrocher tout
                </Button>
              )}

              {/* État HANGUP_RETRY : Réessayer le raccrochage (CTA unique dans panel) */}
              {powerUiState === 'hangupRetry' && onRetryHangup && (
                <Button
                  variant="danger"
                  size="md"
                  className="calls-workspace__power-cta"
                  onClick={onRetryHangup}
                  title="Le raccrochage serveur a échoué — la session est encore active côté Telnyx."
                >
                  Réessayer le raccrochage
                </Button>
              )}

              {/* Bouton secondaire pour désactiver Power en ready */}
              {powerUiState === 'ready' && onTogglePower && (
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
