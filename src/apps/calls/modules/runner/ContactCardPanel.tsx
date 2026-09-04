import { Button, GlassCard, Tag } from '../../../../components/ui';
import { DatePicker } from '../../formControls';
import { LinkedInRecordLink, SalesforceRecordLink } from '../../BrandLinks';
import type { ContactContext, SessionContact } from '../../types';
import { formatAttemptLabel, listStatusDisplay } from './runnerFormatters';
import { useDialer } from '../dialer/DialerProvider';

export type ContactCardPanelProps = {
  contact: SessionContact;
  className: string;
  showCheckmark: boolean;
  displayTitle: string | null;
  displayEmail: string | null;
  sfContactUrl: string | null;
  contextApplies: boolean;
  contextBusy: boolean;
  contactContext: ContactContext | null;
  isRecallQueue: boolean;
  onUpdateRecall: (ids: number[], date: string) => void;
  'aria-hidden'?: boolean;
  /** Masquage de l'action d'appel séquentiel / CallBar (actif en mode Power) */
  isCallBarHidden?: boolean;
};

export function ContactCardPanel({
  contact,
  className,
  showCheckmark,
  displayTitle,
  displayEmail,
  sfContactUrl,
  contextApplies,
  contextBusy,
  contactContext,
  isRecallQueue,
  onUpdateRecall,
  'aria-hidden': ariaHidden,
  isCallBarHidden = false,
}: ContactCardPanelProps) {
  const dialer = useDialer();
  const phone = contact.phone ?? null;
  // Caller ID par défaut : pas de sélection ici — le provider garde l'état
  // (le sélecteur vit dans DialerView/paramètres). On compose le contact.
  const handleCall = () => {
    if (!phone) return;
    if (dialer.isActive) {
      dialer.hangup();
      return;
    }
    void dialer.startCall(phone);
  };
  return (
    <GlassCard className={className} aria-hidden={ariaHidden}>
      {/* Contenu fadable : le GlassCard reste fixe, seul le texte change d'opacité. */}
      <div className="calls-contact-card__fade">
        {showCheckmark && (
          <div className="calls-log-checkmark" aria-hidden="true">
            ✓
          </div>
        )}
        <div className="calls-contact-card__main">
          <div className="calls-contact-card__who">
            <div className="calls-contact-card__chips">
              {contact.claim_active && contact.claimed_by_label && (
                <Tag variant="alert">Pris par {contact.claimed_by_label}</Tag>
              )}
              {isRecallQueue && contact.origin_session_name && (
                <Tag variant="accent">{contact.origin_session_name}</Tag>
              )}
              {(contact.attempt_count ?? 0) > 0 && (
                <Tag variant={isRecallQueue ? 'accent' : 'muted'}>
                  {formatAttemptLabel(contact.attempt_count ?? 0)}
                </Tag>
              )}
              {contact.status !== 'pending' && (
                <Tag variant={listStatusDisplay(contact).variant}>
                  {listStatusDisplay(contact).label}
                </Tag>
              )}
              {!contextBusy && contextApplies && contactContext?.npa && (
                <Tag variant="alert">Ne pas rappeler (NPA)</Tag>
              )}
            </div>
            <h3>{contact.contact_name}</h3>
            <p className="calls-contact-card__role">
              {[displayTitle, contact.account_name || 'Compte inconnu']
                .filter(Boolean)
                .join(' · ')}
            </p>
            <div
              className={`calls-contact-card__context-meta${contextBusy ? ' calls-contact-card__context-meta--loading' : ''}`}
            >
              {contextApplies && contactContext?.industry && (
                <p className="calls-contact-card__industry">
                  Secteur · {contactContext.industry}
                </p>
              )}
              {contextApplies &&
                contactContext?.peer_clients &&
                contactContext.peer_clients.length > 0 && (
                  <div
                    className="calls-contact-card__peers"
                    aria-label="Références clients"
                  >
                    <span className="calls-contact-card__peers-label">
                      Refs
                    </span>
                    <ul className="calls-contact-card__peers-list">
                      {contactContext.peer_clients.map((peer) => (
                        <li key={peer.id}>
                          {peer.record_url ? (
                            <a
                              className="calls-contact-card__peer"
                              href={peer.record_url}
                              target="_blank"
                              rel="noreferrer"
                              title={peer.name}
                            >
                              {peer.name}
                            </a>
                          ) : (
                            <span
                              className="calls-contact-card__peer calls-contact-card__peer--static"
                              title={peer.name}
                            >
                              {peer.name}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
            </div>
            {(isRecallQueue || contact.status !== 'pending') &&
              contact.recall_at && (
                <div className="calls-contact-card__recall-meta">
                  <span>Rappel</span>
                  <DatePicker
                    compact
                    label="Modifier la date de rappel"
                    value={contact.recall_at}
                    onChange={(next) => {
                      if (next !== contact.recall_at) {
                        onUpdateRecall([contact.id], next);
                      }
                    }}
                    triggerClassName="calls-inline-link"
                  />
                </div>
              )}
          </div>
          <div className="calls-contact-card__links">
            {sfContactUrl && <SalesforceRecordLink href={sfContactUrl} />}
            {contact.linkedin_url && (
              <LinkedInRecordLink href={contact.linkedin_url} />
            )}
          </div>
        </div>

        <div className="calls-contact-card__cta">
          <div className="calls-contact-card__cta-copy">
            {contact.phone ? (
              <a
                href={`tel:${contact.phone}`}
                className="calls-phone-link xos-numeric"
              >
                {contact.phone}
              </a>
            ) : (
              <p className="calls-contact-card__no-phone">Aucun numéro</p>
            )}
            {displayEmail ? (
              <a href={`mailto:${displayEmail}`} className="calls-email-link">
                {displayEmail}
              </a>
            ) : (
              <p className="calls-contact-card__no-email">Aucun email</p>
            )}
          </div>
          {!isCallBarHidden && phone && (
            <Button
              variant={dialer.isActive ? 'danger' : 'primary'}
              onClick={handleCall}
            >
              {dialer.isActive ? 'Raccrocher' : 'Appeler'}
            </Button>
          )}
        </div>
      </div>
    </GlassCard>
  );
}
