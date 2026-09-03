import { useState } from 'react';
import { Button, SegmentedControl } from '../../../components/ui';
import { ConfirmDialog } from '../ConfirmDialog';
import type { AccountSearchContact, AccountSearchHit } from '../types';
import { ContactRow } from './ContactRow';
import { ChevronIcon } from './icons';

const CHANNEL_FILTER_OPTIONS = [
  { value: 'all', label: 'Tous' },
  { value: 'phone', label: 'A téléphone' },
  { value: 'email', label: 'A email' },
] as const;

type ContactChannelFilter = (typeof CHANNEL_FILTER_OPTIONS)[number]['value'];

function contactHasPhone(contact: AccountSearchContact): boolean {
  return Boolean(contact.phone || contact.mobile_phone);
}

function contactHasEmail(contact: AccountSearchContact): boolean {
  return Boolean(contact.email);
}

function matchesContactView(
  contact: AccountSearchContact,
  channel: ContactChannelFilter,
  search: string,
): boolean {
  if (channel === 'phone' && !contactHasPhone(contact)) return false;
  if (channel === 'email' && !contactHasEmail(contact)) return false;
  const query = search.trim().toLowerCase();
  if (!query) return true;
  const name = contact.contact_name.toLowerCase();
  const title = (contact.title ?? '').toLowerCase();
  return name.includes(query) || title.includes(query);
}

export type TargetEntry = {
  account: AccountSearchHit;
  contactIds: Set<string>;
};

export type TargetPanelProps = {
  targetList: Map<string, TargetEntry>;
  onToggleContact: (accountId: string, contactId: string) => void;
  onRemoveAccount: (accountId: string) => void;
  onClearTarget: () => void;
  onPrepareSessions?: () => void;
  isMobileDrawer?: boolean;
  hideFooter?: boolean;
};

export function TargetPanel({
  targetList,
  onToggleContact,
  onRemoveAccount,
  onClearTarget,
  onPrepareSessions,
  isMobileDrawer = false,
  hideFooter = false,
}: TargetPanelProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    // Open the first account by default if present
    const firstKey = targetList.keys().next().value;
    return firstKey ? new Set([firstKey]) : new Set();
  });
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [contactFilter, setContactFilter] =
    useState<ContactChannelFilter>('all');
  const [contactSearch, setContactSearch] = useState('');

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
  const hiddenRetainedCount = entries.reduce((sum, { account, contactIds }) => {
    let hidden = 0;
    for (const contact of account.contacts) {
      if (
        contactIds.has(contact.sf_contact_id) &&
        !matchesContactView(contact, contactFilter, contactSearch)
      ) {
        hidden += 1;
      }
    }
    return sum + hidden;
  }, 0);

  const handleChannelChange = (next: ContactChannelFilter[]) => {
    const selected =
      next.find((value) => value !== contactFilter) ??
      next[0] ??
      contactFilter;
    setContactFilter(selected);
  };

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

      <div className="calls-abm-target-filters">
        <SegmentedControl
          label="Avec canal"
          options={CHANNEL_FILTER_OPTIONS}
          value={[contactFilter]}
          onChange={handleChannelChange}
        />
        <input
          type="text"
          className="calls-input"
          placeholder="Rechercher un contact…"
          value={contactSearch}
          onChange={(event) => setContactSearch(event.target.value)}
          aria-label="Rechercher un contact"
        />
        {hiddenRetainedCount > 0 && (
          <p className="calls-abm-target-filters__hidden">
            {hiddenRetainedCount} contact
            {hiddenRetainedCount > 1 ? 's' : ''} masqué
            {hiddenRetainedCount > 1 ? 's' : ''} par le filtre
          </p>
        )}
      </div>

      <div className="calls-abm-target-panel__list" role="list">
        {entries.map(({ account, contactIds }) => {
          const isExpanded = expandedIds.has(account.id);
          const retainedCount = contactIds.size;
          const totalCount = account.contacts.length;
          const visibleContacts = account.contacts.filter((contact) =>
            matchesContactView(contact, contactFilter, contactSearch),
          );

          return (
            <div
              key={account.id}
              className="calls-abm-target-account"
              role="listitem"
            >
              <div className="calls-abm-target-account__header">
                <Button
                  variant="ghost"
                  size="sm"
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
                </Button>
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
                  {visibleContacts.map((contact) => (
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

      {!hideFooter && onPrepareSessions && (
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
      )}
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
