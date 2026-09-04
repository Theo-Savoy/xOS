import { useEffect, useMemo, useRef, useState } from 'react';
import { FONCTION_PRESETS, type FonctionPresetId } from '../../../crm';
import { Button, GlassCard, SegmentedControl } from '../../../components/ui';
import { ConfirmDialog } from '../ConfirmDialog';
import { ChipGroup } from '../filterControls';
import type { AccountSearchContact, AccountSearchHit } from '../types';
import { ContactRow } from './ContactRow';
import { contactMatchesFonctionPresets } from './fonctionPresetMatch';
import { CloseIcon } from './icons';

const CHANNEL_FILTER_OPTIONS = [
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
  channels: ContactChannelFilter[],
  search: string,
  fonctionIds: readonly FonctionPresetId[],
): boolean {
  // Cumulatif : si plusieurs canaux sont cochés, le contact doit en avoir au
  // moins un (OU). Aucun canal coché = aucun filtrage.
  if (
    channels.length > 0 &&
    !channels.some((channel) =>
      channel === 'phone' ? contactHasPhone(contact) : contactHasEmail(contact),
    )
  ) {
    return false;
  }
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
  onSetRetainedContacts?: (accountId: string, contactIds: Set<string>) => void;
  onRemoveAccount: (accountId: string) => void;
  onRestoreAccount?: (entry: TargetEntry) => void;
  onClearTarget: () => void;
  onPrepareSessions?: () => void;
  isMobileDrawer?: boolean;
  hideFooter?: boolean;
};

export function TargetPanel({
  targetList,
  onToggleContact,
  onSetRetainedContacts,
  onRemoveAccount,
  onRestoreAccount,
  onClearTarget,
  onPrepareSessions,
  isMobileDrawer = false,
  hideFooter = false,
}: TargetPanelProps) {
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [channelFilters, setChannelFilters] = useState<ContactChannelFilter[]>(
    [],
  );
  const [contactSearch, setContactSearch] = useState('');
  const [fonctionIds, setFonctionIds] = useState<FonctionPresetId[]>([]);

  // Comptes retirés (suppression douce) : on garde l'entrée complète en
  // local pour pouvoir remettre le compte sans perdre la sélection de
  // contacts, même si la recherche a changé entre-temps.
  const [removedEntriesById, setRemovedEntriesById] = useState<
    Map<string, TargetEntry>
  >(() => new Map());

  const entries = Array.from(targetList.values());
  const totalAccounts = targetList.size;
  const totalRetainedContacts = entries.reduce(
    (sum, entry) => sum + entry.contactIds.size,
    0,
  );

  // Une entrée rempile via les résultats de recherche : elle quitte la
  // liste des « retirés ». Panier vidé : la liste est purgée.
  const removedEntries = useMemo(() => {
    const visible: TargetEntry[] = [];
    for (const [id, entry] of removedEntriesById) {
      if (!targetList.has(id)) visible.push(entry);
    }
    return visible;
  }, [removedEntriesById, targetList]);

  const activeEntries = useMemo(
    () => entries.filter((entry) => !removedEntriesById.has(entry.account.id)),
    [entries, removedEntriesById],
  );

  const hiddenRetainedCount = useMemo(() => {
    let hidden = 0;
    for (const { account, contactIds } of activeEntries) {
      for (const contact of account.contacts) {
        if (
          contactIds.has(contact.sf_contact_id) &&
          !matchesContactView(
            contact,
            channelFilters,
            contactSearch,
            fonctionIds,
          )
        ) {
          hidden += 1;
        }
      }
    }
    return hidden;
  }, [activeEntries, channelFilters, contactSearch, fonctionIds]);

  const handleRemoveAccount = (accountId: string) => {
    const entry = targetList.get(accountId);
    if (entry) {
      setRemovedEntriesById((prev) => {
        const next = new Map(prev);
        next.set(accountId, entry);
        return next;
      });
    }
    onRemoveAccount(accountId);
  };

  const handleRestoreAccount = (entry: TargetEntry) => {
    setRemovedEntriesById((prev) => {
      const next = new Map(prev);
      next.delete(entry.account.id);
      return next;
    });
    onRestoreAccount?.(entry);
  };

  const handleConfirmClear = () => {
    onClearTarget();
    setConfirmClearOpen(false);
  };

  // Un preset coché = on retient uniquement les contacts qui matchent, pour
  // tous les comptes actifs. Plus aucun preset = tout est resélectionné.
  const previousFonctionIds = useRef<readonly FonctionPresetId[]>([]);
  useEffect(() => {
    const hadPresets = previousFonctionIds.current.length > 0;
    previousFonctionIds.current = fonctionIds;
    if (!onSetRetainedContacts) return;
    if (fonctionIds.length > 0) {
      let changed = false;
      const replacements: { accountId: string; contactIds: Set<string> }[] = [];
      for (const { account, contactIds } of activeEntries) {
        const next = new Set(
          account.contacts
            .filter((c) => contactMatchesFonctionPresets(c.title, fonctionIds))
            .map((c) => c.sf_contact_id),
        );
        if (
          next.size !== contactIds.size ||
          [...next].some((id) => !contactIds.has(id))
        ) {
          changed = true;
          replacements.push({ accountId: account.id, contactIds: next });
        }
      }
      if (changed) {
        for (const { accountId, contactIds: ids } of replacements) {
          onSetRetainedContacts(accountId, ids);
        }
      }
    } else if (hadPresets) {
      for (const { account } of activeEntries) {
        onSetRetainedContacts(
          account.id,
          new Set(account.contacts.map((c) => c.sf_contact_id)),
        );
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fonctionIds]);

  if (totalAccounts === 0 && removedEntries.length === 0) {
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
            hint="Cumulable : cochez plusieurs canaux"
            options={CHANNEL_FILTER_OPTIONS}
            value={channelFilters}
            onChange={setChannelFilters}
          />
          <ChipGroup
            label="Fonction"
            hint="Cochez pour ne retenir que ces fonctions"
            options={FONCTION_PRESETS.map((preset) => ({
              value: preset.id,
              label: preset.label,
            }))}
            value={fonctionIds}
            onChange={setFonctionIds}
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
        {activeEntries.map(({ account, contactIds }) => {
          const retainedCount = contactIds.size;
          const totalCount = account.contacts.length;
          const visibleContacts = account.contacts.filter((contact) =>
            matchesContactView(
              contact,
              channelFilters,
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
                    onClick={() => handleRemoveAccount(account.id)}
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

        {removedEntries.length > 0 && (
          <div className="calls-abm-composer__removed" role="list">
            <p className="calls-abm-composer__removed-title">
              Comptes retirés — remettez-les si vous changez d'avis
            </p>
            {removedEntries.map((entry) => (
              <div
                key={entry.account.id}
                className="calls-abm-composer__removed-account"
                role="listitem"
              >
                <span className="calls-abm-composer__removed-name">
                  {entry.account.name}
                  <span className="calls-abm-composer__removed-count xos-numeric">
                    {entry.contactIds.size} contact
                    {entry.contactIds.size > 1 ? 's' : ''}
                  </span>
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleRestoreAccount(entry)}
                  aria-label={`Remettre ${entry.account.name} dans la cible`}
                >
                  Remettre
                </Button>
              </div>
            ))}
          </div>
        )}
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
