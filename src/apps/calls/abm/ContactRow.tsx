import { Checkbox, Tag } from '../../../components/ui';
import type { AccountSearchContact } from '../types';
import { MailIcon, PhoneIcon } from './icons';

export type ContactRowProps = {
  contact: AccountSearchContact;
  selected: boolean;
  onToggle: (contactId: string) => void;
};

export function ContactRow({ contact, selected, onToggle }: ContactRowProps) {
  const hasPhone = Boolean(contact.phone || contact.mobile_phone);
  const hasEmail = Boolean(contact.email);

  const decisionBadge = (() => {
    switch (contact.decision_level) {
      case '+':
        return <Tag variant="accent">Décideur</Tag>;
      case '=':
        return <Tag variant="warning">Influenceur</Tag>;
      case '-':
        return <Tag variant="muted">Non décideur</Tag>;
      default:
        return null;
    }
  })();

  return (
    <div
      className={`calls-abm-contact-row ${selected ? 'calls-abm-contact-row--selected' : ''}`}
      onClick={() => onToggle(contact.sf_contact_id)}
      role="listitem"
    >
      <div
        className="calls-abm-contact-row__check"
        onClick={(e) => e.stopPropagation()}
      >
        <Checkbox
          checked={selected}
          onChange={() => onToggle(contact.sf_contact_id)}
          aria-label={`Retenir ${contact.contact_name}`}
        />
      </div>

      <div className="calls-abm-contact-row__main">
        <div className="calls-abm-contact-row__top">
          <span className="calls-abm-contact-row__name">
            {contact.contact_name}
          </span>
          {decisionBadge}
        </div>

        <div className="calls-abm-contact-row__bottom">
          <span className="calls-abm-contact-row__title">
            {contact.title || '—'}
          </span>
          <div
            className="calls-abm-contact-row__channels"
            aria-label="Canaux disponibles"
          >
            {hasPhone && (
              <span
                className="calls-abm-channel-icon"
                title={contact.mobile_phone || contact.phone || undefined}
                aria-label="Téléphone disponible"
              >
                <PhoneIcon />
              </span>
            )}
            {hasEmail && (
              <span
                className="calls-abm-channel-icon"
                title={contact.email || undefined}
                aria-label="Email disponible"
              >
                <MailIcon />
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
