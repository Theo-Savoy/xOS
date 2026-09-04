import { useEffect, useMemo, useState } from 'react';
import { Button, Checkbox, EmptyState, Tag } from '../../../../../components/ui';
import type { SessionContact } from '../../../types';
import { listStatusDisplay } from '../runnerFormatters';
import type { QueueToolState } from './types';

type QueueStatusFilter = 'all' | 'pending' | 'called' | 'skipped';

export interface QueueToolOverlayProps {
  open: boolean;
  contacts: SessionContact[];
  currentUserId?: string | null;
  isPowerConversation?: boolean;
  onClose: () => void;
  onRequestFocus: (contactId: number) => void;
  onStateChange: (state: QueueToolState) => void;
}

function isClaimedByOther(
  contact: SessionContact,
  currentUserId: string | null | undefined,
): boolean {
  return Boolean(
    contact.claim_active &&
      contact.claimed_by &&
      contact.claimed_by !== currentUserId,
  );
}

function isSelectable(contact: SessionContact): boolean {
  return (
    contact.status === 'pending' ||
    (contact.status === 'called' && Boolean(contact.recall_at))
  );
}

export function QueueToolOverlay({
  open,
  contacts,
  currentUserId = null,
  isPowerConversation = false,
  onClose,
  onRequestFocus,
  onStateChange,
}: QueueToolOverlayProps) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<QueueStatusFilter>('all');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkComments, setBulkComments] = useState('');

  const isDirty = bulkComments.trim().length > 0;

  useEffect(() => {
    onStateChange({
      hasSelection: selectedIds.length > 0,
      isDirty,
    });
  }, [isDirty, onStateChange, selectedIds.length]);

  useEffect(() => {
    if (open) return;
    setQuery('');
    setStatusFilter('all');
    setSelectedIds([]);
    setBulkComments('');
  }, [open]);

  const filteredContacts = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('fr-FR');
    return contacts.filter((contact) => {
      if (statusFilter !== 'all' && contact.status !== statusFilter)
        return false;
      if (!normalizedQuery) return true;
      return [
        contact.contact_name,
        contact.account_name,
        contact.title,
        contact.phone,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value).toLocaleLowerCase('fr-FR').includes(normalizedQuery),
        );
    });
  }, [contacts, query, statusFilter]);

  const toggleSelected = (contact: SessionContact, checked: boolean) => {
    if (
      !isSelectable(contact) ||
      isClaimedByOther(contact, currentUserId)
    ) {
      return;
    }
    setSelectedIds((current) => {
      if (checked) {
        return current.includes(contact.id)
          ? current
          : [...current, contact.id];
      }
      return current.filter((id) => id !== contact.id);
    });
  };

  if (!open || isPowerConversation) return null;

  return (
    <div
      className="calls-workspace__queue-tool-backdrop"
      onClick={onClose}
      data-testid="queue-tool-overlay"
    >
      <section
        className="calls-workspace__queue-tool"
        role="dialog"
        aria-modal="true"
        aria-label="File étendue"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="calls-workspace__queue-tool-header">
          <div>
            <p className="calls-workspace__eyebrow">Surface outil de la file</p>
            <h2>File étendue</h2>
            <p className="calls-muted">
              Recherchez, sélectionnez et agissez sans basculer vers un second
              mode de liste.
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Fermer la file étendue"
          >
            ✕
          </Button>
        </header>

        <div className="calls-workspace__queue-tool-toolbar">
          <label className="calls-workspace__queue-tool-search">
            <span>Rechercher</span>
            <input
              type="search"
              className="calls-input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Rechercher dans la file"
              placeholder="Nom, compte, téléphone…"
            />
          </label>
          <div
            className="calls-workspace__queue-tool-filters"
            role="group"
            aria-label="Filtrer la file"
          >
            {(
              [
                ['all', 'Tous'],
                ['pending', 'À faire'],
                ['called', 'Appelés'],
                ['skipped', 'Non contactés'],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                variant="ghost"
                size="sm"
                className={
                  statusFilter === value
                    ? 'calls-workspace__queue-tool-filter--active'
                    : undefined
                }
                aria-pressed={statusFilter === value}
                onClick={() => setStatusFilter(value)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>

        <div className="calls-workspace__queue-tool-content">
          {filteredContacts.length === 0 ? (
            <EmptyState
              title="Aucun contact trouvé"
              description="Modifiez la recherche ou le filtre de la file."
            />
          ) : (
            <ul
              className="calls-workspace__queue-tool-list"
              role="list"
              aria-label="Contacts de la file étendue"
            >
              {filteredContacts.map((contact) => {
                const statusInfo = listStatusDisplay(contact);
                const claimedByOther = isClaimedByOther(
                  contact,
                  currentUserId,
                );
                const selectable = isSelectable(contact) && !claimedByOther;
                const selected = selectedIds.includes(contact.id);

                return (
                  <li
                    key={contact.id}
                    className={`calls-workspace__queue-tool-row${selected ? ' calls-workspace__queue-tool-row--selected' : ''}`}
                  >
                    <Checkbox
                      checked={selected}
                      disabled={!selectable}
                      onChange={(checked) => toggleSelected(contact, checked)}
                      aria-label={`Sélectionner ${contact.contact_name}`}
                    />
                    <div className="calls-workspace__queue-tool-contact">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="calls-workspace__queue-tool-contact-link"
                        onClick={() => onRequestFocus(contact.id)}
                        aria-label={`Ouvrir ${contact.contact_name}`}
                      >
                        {contact.contact_name}
                      </Button>
                      <span className="calls-workspace__queue-tool-account">
                        {contact.account_name || 'Compte inconnu'}
                      </span>
                    </div>
                    <div className="calls-workspace__queue-tool-meta">
                      <Tag variant={statusInfo.variant}>{statusInfo.label}</Tag>
                      {claimedByOther && (
                        <Tag variant="alert">
                          Pris par {contact.claimed_by_label || 'un autre agent'}
                        </Tag>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <section
            className="calls-workspace__queue-tool-bulk"
            aria-label="Actions groupées"
          >
            <div className="calls-workspace__queue-tool-bulk-head">
              <h3>Actions groupées</h3>
              <span className="calls-muted">
                {selectedIds.length} sélectionné
                {selectedIds.length > 1 ? 's' : ''}
              </span>
            </div>
            {selectedIds.length === 0 ? (
              <p className="calls-muted">
                Sélectionnez un ou plusieurs contacts pour afficher les actions.
              </p>
            ) : (
              <label className="calls-workspace__queue-tool-comment">
                <span>Commentaire groupé</span>
                <textarea
                  className="calls-textarea"
                  rows={3}
                  value={bulkComments}
                  onChange={(event) => setBulkComments(event.target.value)}
                  aria-label="Commentaire groupé"
                  placeholder="Contexte commun à conserver…"
                />
              </label>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}
