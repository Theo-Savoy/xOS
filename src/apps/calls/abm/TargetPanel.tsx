import { useState } from 'react';
import { Button } from '../../../components/ui';
import { ConfirmDialog } from '../ConfirmDialog';
import type { AccountSearchHit } from '../types';
import { ContactRow } from './ContactRow';
import { ChevronIcon } from './icons';

export type TargetEntry = {
  account: AccountSearchHit;
  contactIds: Set<string>;
};

export type TargetPanelProps = {
  targetList: Map<string, TargetEntry>;
  onToggleContact: (accountId: string, contactId: string) => void;
  onRemoveAccount: (accountId: string) => void;
  onClearTarget: () => void;
  onPrepareSessions: () => void;
  isMobileDrawer?: boolean;
};

export function TargetPanel({
  targetList,
  onToggleContact,
  onRemoveAccount,
  onClearTarget,
  onPrepareSessions,
  isMobileDrawer = false,
}: TargetPanelProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    // Open the first account by default if present
    const firstKey = targetList.keys().next().value;
    return firstKey ? new Set([firstKey]) : new Set();
  });
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  const toggleExpand = (accountId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(accountId)) next.delete(accountId);
      else next.add(accountId);
      return next;
    });
  };

  const entries = Array.from(targetList.values());
  const totalAccounts = targetList.size;
  const totalRetainedContacts = entries.reduce(
    (sum, entry) => sum + entry.contactIds.size,
    0,
  );

  const handleConfirmClear = () => {
    onClearTarget();
    setConfirmClearOpen(false);
  };

  if (totalAccounts === 0) {
    return null;
  }

  return (
    <div
      className={`calls-abm-target-panel ${isMobileDrawer ? 'calls-abm-target-panel--drawer' : ''}`}
      aria-label="Panier cible ABM"
    >
      <div className="calls-abm-target-panel__header">
        <div className="calls-abm-target-panel__title-row">
          <h3 className="calls-abm-target-panel__title">Cible</h3>
          <Button
            variant="ghost"
            size="sm"
            className="calls-abm-target-panel__clear-btn"
            onClick={() => setConfirmClearOpen(true)}
            aria-label="Vider la cible"
          >
            Vider
          </Button>
        </div>
        <div
          className="calls-abm-target-panel__summary xos-numeric"
          aria-live="polite"
        >
          {totalAccounts} compte{totalAccounts > 1 ? 's' : ''} ·{' '}
          {totalRetainedContacts} contact
          {totalRetainedContacts > 1 ? 's' : ''} retenu
          {totalRetainedContacts > 1 ? 's' : ''}
        </div>
      </div>

      <div className="calls-abm-target-panel__list" role="list">
        {entries.map(({ account, contactIds }) => {
          const isExpanded = expandedIds.has(account.id);
          const retainedCount = contactIds.size;
          const totalCount = account.contacts.length;

          return (
            <div
              key={account.id}
              className="calls-abm-target-account"
              role="listitem"
            >
              <div className="calls-abm-target-account__header">
                <button
                  type="button"
                  className="calls-abm-target-account__toggle"
                  onClick={() => toggleExpand(account.id)}
                  aria-expanded={isExpanded}
                  aria-label={`${account.name}, ${retainedCount} sur ${totalCount} contacts retenus`}
                >
                  <span className="calls-abm-target-account__chevron">
                    <ChevronIcon direction={isExpanded ? 'up' : 'down'} />
                  </span>
                  <span className="calls-abm-target-account__name">
                    {account.name}
                  </span>
                </button>
                <Button
                  variant="icon"
                  size="sm"
                  className="calls-abm-target-account__remove"
                  onClick={() => onRemoveAccount(account.id)}
                  aria-label={`Retirer ${account.name} de la cible`}
                  title="Retirer de la cible"
                >
                  ×
                </Button>
              </div>

              <div className="calls-abm-target-account__count xos-numeric">
                {retainedCount} / {totalCount} retenu
                {retainedCount > 1 ? 's' : ''}
              </div>

              {isExpanded && (
                <div
                  className="calls-abm-target-account__contacts"
                  role="list"
                  aria-label={`Contacts de ${account.name}`}
                >
                  {account.contacts.map((contact) => (
                    <ContactRow
                      key={contact.sf_contact_id}
                      contact={contact}
                      selected={contactIds.has(contact.sf_contact_id)}
                      onToggle={(contactId) =>
                        onToggleContact(account.id, contactId)
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="calls-abm-target-panel__footer">
        <Button
          className="calls-abm-target-panel__cta"
          onClick={onPrepareSessions}
          disabled={totalRetainedContacts === 0}
          aria-disabled={totalRetainedContacts === 0}
          title={
            totalRetainedContacts === 0
              ? 'Sélectionnez au moins un contact pour préparer les séances'
              : undefined
          }
        >
          Préparer les séances →
        </Button>
      </div>

      <ConfirmDialog
        open={confirmClearOpen}
        title="Vider la cible"
        description={`Êtes-vous sûr de vouloir vider la cible ? Cela retirera les ${totalAccounts} compte${totalAccounts > 1 ? 's' : ''} sélectionnés.`}
        confirmLabel="Vider la cible"
        cancelLabel="Annuler"
        onConfirm={handleConfirmClear}
        onCancel={() => setConfirmClearOpen(false)}
      />
    </div>
  );
}
