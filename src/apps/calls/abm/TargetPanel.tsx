import { useState } from 'react';
import {
  FONCTION_PRESETS,
  type FonctionPresetId,
} from '../../../crm';
import { Button, GlassCard, SegmentedControl } from '../../../components/ui';
import { ConfirmDialog } from '../ConfirmDialog';
import { ChipGroup } from '../filterControls';
import type { AccountSearchContact, AccountSearchHit } from '../types';
import { ContactRow } from './ContactRow';
import { contactMatchesFonctionPresets } from './fonctionPresetMatch';
import { CloseIcon } from './icons';

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
  fonctionIds: readonly FonctionPresetId[],
): boolean {
  if (channel === 'phone' && !contactHasPhone(contact)) return false;
  if (channel === 'email' && !contactHasEmail(contact)) return false;
  const query = search.trim().toLowerCase();
  if (query) {
    const name = contact.contact_name.toLowerCase();
    const title = (contact.title ?? '').toLowerCase();
    if (!name.includes(query) && !title.includes(query)) return false;
  }
  return contactMatchesFonctionPresets(contact.title, fonctionIds);
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
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [contactFilter, setContactFilter] =
    useState<ContactChannelFilter>('all');
  const [contactSearch, setContactSearch] = useState('');
  const [fonctionIds, setFonctionIds] = useState<FonctionPresetId[]>([]);

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
        !matchesContactView(
          contact,
          contactFilter,
          contactSearch,
          fonctionIds,
        )
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
      className={`calls-abm-composer ${isMobileDrawer ? 'calls-abm-composer--drawer' : ''}`}
      aria-label="Panier cible ABM"
    >
      <GlassCard className="calls-plan-card">
        <div className="calls-plan-card__head">
          <h3 className="calls-plan-card__title">Comptes ciblés</h3>
          <span
            className="calls-abm-composer__summary xos-numeric"
            aria-live="polite"
          >
            {totalAccounts} compte{totalAccounts > 1 ? 's' : ''} ·{' '}
            {totalRetainedContacts} contact
            {totalRetainedContacts > 1 ? 's' : ''} retenu
            {totalRetainedContacts > 1 ? 's' : ''}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirmClearOpen(true)}
            aria-label="Vider le panier"
          >
            Vider le panier
          </Button>
        </div>
        <div className="calls-abm-composer__filters">
          <SegmentedControl
            label="Avec canal"
            options={CHANNEL_FILTER_OPTIONS}
            value={[contactFilter]}
            onChange={handleChannelChange}
          />
          <ChipGroup
            label="Fonction"
            hint="Presets sur le poste (OR entre les cases cochées)"
            options={FONCTION_PRESETS.map((preset) => ({
              value: preset.id,
              label: preset.label,
            }))}
            value={fonctionIds}
            onChange={(next) => setFonctionIds(next)}
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
            <p className="calls-abm-composer__hidden">
              {hiddenRetainedCount} contact
              {hiddenRetainedCount > 1 ? 's' : ''} masqué
              {hiddenRetainedCount > 1 ? 's' : ''} par le filtre
            </p>
          )}
        </div>
      </GlassCard>

      <div className="calls-abm-composer__accounts" role="list">
        {entries.map(({ account, contactIds }) => {
          const retainedCount = contactIds.size;
          const totalCount = account.contacts.length;
          const visibleContacts = account.contacts.filter((contact) =>
            matchesContactView(
              contact,
              contactFilter,
              contactSearch,
              fonctionIds,
            ),
          );

          return (
            <div
              key={account.id}
              className="calls-abm-composer__account"
              role="listitem"
            >
              <div className="calls-fb-section">
                <div className="calls-abm-composer__account-head">
                  <span className="calls-fb-section__title">
                    {account.name}
                    <span
                      className="calls-fb-section__badge"
                      aria-label={`${retainedCount} sur ${totalCount} contacts retenus`}
                    >
                      {retainedCount}/{totalCount}
                    </span>
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRemoveAccount(account.id)}
                    aria-label={`Retirer ${account.name} de la cible`}
                  >
                    <CloseIcon />
                    Retirer
                  </Button>
                </div>
                <div className="calls-fb-section__body">
                  <div className="calls-abm-composer__account-tools">
                    <span className="calls-abm-composer__account-count xos-numeric">
                      {retainedCount} / {totalCount} retenu
                      {retainedCount > 1 ? 's' : ''}
                    </span>
                  </div>
                  <div
                    className="calls-abm-composer__contacts"
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
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {!hideFooter && onPrepareSessions && (
        <div className="calls-abm-composer__footer">
          <Button
            className="calls-abm-composer__cta"
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
        title="Vider le panier"
        description={`Vider le panier retirera les ${totalAccounts} compte${totalAccounts > 1 ? 's' : ''} sélectionné${totalAccounts > 1 ? 's' : ''}.`}
        confirmLabel="Vider le panier"
        cancelLabel="Annuler"
        onConfirm={handleConfirmClear}
        onCancel={() => setConfirmClearOpen(false)}
      />
    </div>
  );
}
