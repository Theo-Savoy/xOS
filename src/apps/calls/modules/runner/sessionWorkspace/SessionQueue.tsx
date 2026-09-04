import { useMemo } from 'react';
import { Button, EmptyState, Tag } from '../../../../../components/ui';
import type { SessionContact } from '../../../types';
import { listStatusDisplay } from '../runnerFormatters';
import type { ProjectedPowerQueue } from './types';

export interface SessionQueueProps {
  contacts: SessionContact[];
  focusedContactId?: number | null;
  onFocusContact: (contactId: number) => void;
  isPowerActive?: boolean;
  projectedPowerQueue?: ProjectedPowerQueue | null;
  /** Repli automatique en conversation ou en ACW (Plan §1 & Grok note b) */
  isCollapsed?: boolean;
  /** Mode sheet en affichage responsive (<720px) */
  isSheet?: boolean;
  onCloseSheet?: () => void;
}

export function SessionQueue({
  contacts,
  focusedContactId,
  onFocusContact,
  isPowerActive = false,
  projectedPowerQueue,
  isCollapsed = false,
  isSheet = false,
  onCloseSheet,
}: SessionQueueProps) {
  const readyPowerContactIds = useMemo(() => {
    return new Set(projectedPowerQueue?.contactIds ?? []);
  }, [projectedPowerQueue]);

  if (isCollapsed && !isSheet) {
    return null;
  }

  return (
    <aside
      className={`calls-workspace__queue ${isSheet ? 'calls-workspace__queue--sheet' : ''}`}
      role="region"
      aria-label="File d'attente des contacts"
    >
      <div className="calls-workspace__queue-header">
        <h3 className="calls-workspace__queue-title">
          File d&apos;attente ({contacts.length})
        </h3>
        {isSheet && onCloseSheet && (
          <Button
            variant="ghost"
            size="sm"
            className="calls-workspace__queue-close"
            onClick={onCloseSheet}
            aria-label="Fermer la file d'attente"
          >
            ✕
          </Button>
        )}
      </div>

      <div className="calls-workspace__queue-scrollable">
        {contacts.length === 0 ? (
          <EmptyState
            title="File vide"
            description="Aucun contact dans la file d'attente."
          />
        ) : (
          <ul className="calls-workspace__queue-list" role="list">
            {contacts.map((contact) => {
              const isFocused = contact.id === focusedContactId;
              const statusInfo = listStatusDisplay(contact);
              const isPowerReady =
                isPowerActive && readyPowerContactIds.has(contact.id);

              return (
                <li
                  key={contact.id}
                  className={`calls-workspace__queue-item ${isFocused ? 'calls-workspace__queue-item--focused' : ''}`}
                >
                  <Button
                    variant="ghost"
                    className="calls-workspace__queue-item-btn"
                    onClick={() => onFocusContact(contact.id)}
                    aria-current={isFocused ? 'true' : undefined}
                  >
                    <div className="calls-workspace__queue-item-header">
                      <span className="calls-workspace__queue-name">
                        {contact.contact_name}
                      </span>
                      {isPowerReady && (
                        <Tag
                          variant="accent"
                          className="calls-workspace__queue-power-tag"
                        >
                          Power
                        </Tag>
                      )}
                    </div>

                    <div className="calls-workspace__queue-subline">
                      <span className="calls-workspace__queue-company">
                        {contact.account_name ||
                          contact.title ||
                          'Compte inconnu'}
                      </span>
                    </div>

                    <div className="calls-workspace__queue-badges">
                      <Tag variant={statusInfo.variant}>{statusInfo.label}</Tag>
                      {contact.claim_active && contact.claimed_by_label && (
                        <Tag variant="alert">
                          Pris par {contact.claimed_by_label}
                        </Tag>
                      )}
                    </div>
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
