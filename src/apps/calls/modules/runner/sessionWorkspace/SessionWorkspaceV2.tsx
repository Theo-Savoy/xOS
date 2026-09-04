import { GlassCard, Skeleton } from '../../../../../components/ui';
import type { SessionWorkspaceProps } from './types';

/**
 * Surface initiale SessionWorkspace V2 (socle de migration #119).
 * Le shell visuel complet (SessionQueue, ContactWorkspace, ContextInspector, PowerWorkspace)
 * sera déployé dans les lots L2-L4.
 */
export function SessionWorkspaceV2({
  session,
  contacts,
  loading,
  error,
  onBack,
}: SessionWorkspaceProps) {
  return (
    <div
      className="calls-view calls-view--runner calls-workspace--v2"
      data-testid="session-workspace-v2"
      role="region"
      aria-label={`Séance V2 : ${session.name}`}
    >
      <header className="calls-view__header calls-view__header--runner">
        <div className="calls-view__nav">
          <button
            type="button"
            className="xos-btn xos-btn--secondary xos-btn--md calls-view__back"
            onClick={onBack}
          >
            Quitter
          </button>
          <div className="calls-view__titleblock">
            <h2>{session.name}</h2>
          </div>
        </div>
      </header>

      <main className="calls-workspace__body">
        {loading ? (
          <div className="calls-workspace__loading" role="status">
            <Skeleton count={3} />
          </div>
        ) : error ? (
          <GlassCard className="calls-workspace__error" role="alert">
            <p>{error}</p>
          </GlassCard>
        ) : (
          <div className="calls-workspace__placeholder">
            <p>
              SessionWorkspace V2 actif pour {session.name} ({contacts.length}{' '}
              contacts).
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
