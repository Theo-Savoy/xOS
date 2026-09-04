import { Button, GlassCard } from '../../../../../components/ui';
import { SalesforceRecordLink } from '../../../BrandLinks';
import { ContextSideSkeleton } from '../../../ContextSideSkeleton';
import { formatActivityDateFr } from '../../../formControls.helpers';
import type { ContactContext, SessionContact } from '../../../types';
import { formatRelativeDaysFr } from '../runnerFormatters';

export interface ContextInspectorProps {
  contactContext: ContactContext | null;
  contextContactId?: number | null;
  contextTargetContactId?: number | null;
  loading: boolean;
  contact: SessionContact | null;
  /** Replié en sheet pour les largeurs <720px et 720-899px (Plan §1) */
  isSheet?: boolean;
  onCloseSheet?: () => void;
}

export function ContextInspector({
  contactContext,
  contextContactId,
  contextTargetContactId,
  loading,
  contact,
  isSheet = false,
  onCloseSheet,
}: ContextInspectorProps) {
  const contextApplies = Boolean(
    contact &&
      contactContext &&
      contextContactId != null &&
      contextContactId === contact.id,
  );
  const contextBusy = Boolean(
    loading ||
      (contact &&
        contextTargetContactId === contact.id &&
        contextContactId !== contact.id),
  );
  return (
    <aside
      className={`calls-workspace__inspector ${isSheet ? 'calls-workspace__inspector--sheet' : ''}`}
      role="region"
      aria-label="Contexte CRM"
    >
      <div className="calls-workspace__inspector-header">
        <h3 className="calls-workspace__inspector-title">Contexte CRM</h3>
        {isSheet && onCloseSheet && (
          <Button
            variant="ghost"
            size="sm"
            className="calls-workspace__inspector-close"
            onClick={onCloseSheet}
            aria-label="Fermer le contexte CRM"
          >
            ✕
          </Button>
        )}
      </div>

      <div className="calls-workspace__inspector-content">
        {contextBusy ? (
          <ContextSideSkeleton />
        ) : !contact || !contactContext || !contextApplies ? (
          <GlassCard className="calls-context-panel">
            <p className="calls-muted">
              {!contact
                ? 'Aucun contact sélectionné.'
                : 'Aucun contexte CRM disponible pour ce contact.'}
            </p>
          </GlassCard>
        ) : (
          <>
            {/* 1. Historique d'appels */}
            <GlassCard className="calls-context-panel">
              <h4 className="calls-context-panel__title">
                Historique d&apos;appels
              </h4>
              {contactContext.tasks.length === 0 ? (
                <p className="calls-muted">Aucun appel récent enregistré.</p>
              ) : (
                <ul
                  className="calls-context-list"
                  aria-label="Historique des appels"
                >
                  {contactContext.tasks.slice(0, 5).map((task, index) => (
                    <li
                      key={task.id}
                      className={`calls-context-list__item ${index === 0 ? 'calls-context-list__item--latest' : ''}`}
                    >
                      <div className="calls-context-list__meta">
                        <strong className="calls-context-list__result">
                          {task.result ?? task.subject ?? 'Appel'}
                        </strong>
                        <span className="calls-context-list__date xos-numeric">
                          {formatActivityDateFr(task.activity_date)}
                          <small>
                            {' '}
                            ({formatRelativeDaysFr(task.activity_date)})
                          </small>
                        </span>
                      </div>
                      {task.record_url && (
                        <SalesforceRecordLink href={task.record_url} />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </GlassCard>

            {/* 2. Opportunités du compte */}
            <GlassCard className="calls-context-panel">
              <h4 className="calls-context-panel__title">
                Opportunités du compte
              </h4>
              {contactContext.opportunities.length === 0 ? (
                <p className="calls-muted">Aucune opportunité sur ce compte.</p>
              ) : (
                <ul
                  className="calls-context-list"
                  aria-label="Opportunités associées"
                >
                  {contactContext.opportunities.slice(0, 5).map((opp) => (
                    <li key={opp.id} className="calls-context-list__item">
                      <div className="calls-context-list__meta">
                        <strong className="calls-context-list__opp-name">
                          {opp.name}
                        </strong>
                        <span className="calls-context-list__stage">
                          {opp.stage_name}
                          {opp.amount != null && (
                            <span className="xos-numeric">
                              {' '}
                              · {opp.amount} €
                            </span>
                          )}
                        </span>
                      </div>
                      {opp.record_url && (
                        <SalesforceRecordLink href={opp.record_url} />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </GlassCard>

            {/* 3. Références clients */}
            {contactContext.peer_clients &&
              contactContext.peer_clients.length > 0 && (
                <GlassCard className="calls-context-panel">
                  <h4 className="calls-context-panel__title">
                    Références clients du secteur
                  </h4>
                  <ul
                    className="calls-context-list"
                    aria-label="Références clients"
                  >
                    {contactContext.peer_clients.slice(0, 5).map((peer) => (
                      <li key={peer.id} className="calls-context-list__item">
                        <span>{peer.name}</span>
                        {peer.record_url && (
                          <SalesforceRecordLink href={peer.record_url} />
                        )}
                      </li>
                    ))}
                  </ul>
                </GlassCard>
              )}
          </>
        )}
      </div>
    </aside>
  );
}
