import { Button, Checkbox, Tag } from '../../../components/ui';
import type { AccountSearchHit } from '../types';
import { CheckIcon, PlusIcon } from './icons';

export type AccountRowProps = {
  account: AccountSearchHit;
  inTarget: boolean;
  onToggleTarget: (account: AccountSearchHit) => void;
  isSubsidiary?: boolean;
  onToggleGroup?: () => void;
  allGroupSelected?: boolean;
  groupSubsidiariesCount?: number;
};

export function AccountRow({
  account,
  inTarget,
  onToggleTarget,
  isSubsidiary = false,
  onToggleGroup,
  allGroupSelected = false,
  groupSubsidiariesCount = 0,
}: AccountRowProps) {
  const hasContacts = account.contacts.length > 0;
  const contactsCount = account.contacts.length;
  const contactsText = `${contactsCount} contact${contactsCount > 1 ? 's' : ''}`;

  const metaParts = [
    account.industry,
    account.owner_name,
    account.type_client,
  ].filter(Boolean);
  const metaText = metaParts.length > 0 ? metaParts.join(' · ') : null;

  return (
    <div
      className={`calls-abm-account-row ${isSubsidiary ? 'calls-abm-account-row--subsidiary' : ''} ${account.is_group ? 'calls-abm-account-row--group' : ''} ${inTarget ? 'calls-abm-account-row--in-target' : ''} ${!hasContacts ? 'calls-abm-account-row--disabled' : ''}`}
      role="listitem"
    >
      <div
        className="calls-abm-account-row__check"
        onClick={(e) => e.stopPropagation()}
      >
        <Checkbox
          checked={inTarget}
          disabled={!hasContacts}
          onChange={() => onToggleTarget(account)}
          aria-label={`Sélectionner ${account.name}`}
        />
      </div>

      <div className="calls-abm-account-row__content">
        <div className="calls-abm-account-row__header">
          {account.is_group && (
            <Tag variant="accent" className="calls-abm-account-row__badge-group">
              Groupe
            </Tag>
          )}
          {isSubsidiary && (
            <Tag variant="default" className="calls-abm-account-row__badge-subsidiary">
              Filiale
            </Tag>
          )}
          <strong className="calls-abm-account-row__name">{account.name}</strong>
          {account.tier && (
            <Tag variant="accent" className="calls-abm-account-row__tier">
              Tier {account.tier}
            </Tag>
          )}
          <span className="calls-abm-account-row__contacts xos-numeric">
            {hasContacts ? contactsText : '0 contact (exclu)'}
          </span>
        </div>

        {metaText && (
          <div className="calls-abm-account-row__meta">
            <span>{metaText}</span>
            {!hasContacts && (
              <span className="calls-abm-account-row__unavailable">
                · Tous déjà en séance
              </span>
            )}
          </div>
        )}
      </div>

      <div className="calls-abm-account-row__action">
        {account.is_group && onToggleGroup && groupSubsidiariesCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="calls-abm-group-select-btn"
            onClick={onToggleGroup}
            aria-label={
              allGroupSelected
                ? `Désélectionner tout le groupe ${account.name}`
                : `Sélectionner tout le groupe ${account.name}`
            }
          >
            {allGroupSelected
              ? 'Désélectionner le groupe'
              : `Tout le groupe (+${groupSubsidiariesCount})`}
          </Button>
        )}
        {hasContacts ? (
          inTarget ? (
            <Button
              variant="ghost"
              size="sm"
              className="calls-abm-action-btn calls-abm-action-btn--in-target"
              onClick={() => onToggleTarget(account)}
              aria-label={`Retirer ${account.name} de la cible`}
            >
              <CheckIcon />
              <span>Ajouté</span>
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              className="calls-abm-action-btn"
              onClick={() => onToggleTarget(account)}
              aria-label={`Ajouter ${account.name} à la cible`}
            >
              <PlusIcon />
              <span>Ajouter</span>
            </Button>
          )
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="calls-abm-action-btn calls-abm-action-btn--disabled"
            disabled
            aria-disabled="true"
          >
            0 contact
          </Button>
        )}
      </div>
    </div>
  );
}
