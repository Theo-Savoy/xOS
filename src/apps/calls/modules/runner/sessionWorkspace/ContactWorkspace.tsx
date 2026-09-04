import { useState } from 'react';
import { Button, Checkbox, EmptyState, GlassCard, Tag } from '../../../../../components/ui';
import type { ResultatCall } from '../../../../../crm';
import { RESULTAT_OPTIONS } from '../../../types';
import type {
  ContactContext,
  SessionContact,
  SessionType,
  TeamMember,
} from '../../../types';
import { EventPanel } from '../../../EventPanel';
import { ResultButtons } from '../../../ResultButtons';
import { ContactCardPanel } from '../ContactCardPanel';
import { RecallFields } from '../../rdv/RecallFields';
import type { LogPayload } from '../RunnerView.types';

export interface ContactWorkspaceProps {
  contact: SessionContact | null;
  contactContext: ContactContext | null;
  contextContactId: number | null;
  loading: boolean;
  onFocusContact: (contactId: number) => void;
  onLogAndNext: (contactId: number, payload: LogPayload) => void;
  onLogRdvAndNext?: (
    contactId: number,
    payload: LogPayload,
    event: {
      start: string;
      durationMin: number;
      subject: string;
      ownerSfUserId: string | null;
    },
  ) => void;
  onUpdateRecall?: (contactIds: number[], recallAt: string | null) => void;
  team?: TeamMember[];
  currentSfUserId?: string | null;
  sessionType?: SessionType;
  awaitingEvent?: SessionContact | null;
  onFinalizeEvent?: (eventData: {
    start: string;
    durationMin: number;
    subject: string;
    ownerSfUserId: string | null;
  }) => void;
}

export function ContactWorkspace({
  contact,
  contactContext,
  contextContactId,
  loading,
  onLogAndNext,
  onLogRdvAndNext,
  onUpdateRecall,
  team = [],
  currentSfUserId = null,
  sessionType,
  awaitingEvent,
  onFinalizeEvent,
}: ContactWorkspaceProps) {
  const [resultat, setResultat] = useState<ResultatCall>(
    RESULTAT_OPTIONS[0].value,
  );
  const [comments, setComments] = useState('');
  const [recallAt, setRecallAt] = useState('');
  const [scheduleRecall, setScheduleRecall] = useState(true);
  const [doNotCall, setDoNotCall] = useState(false);

  if (!contact) {
    return (
      <main
        className="calls-workspace__contact"
        role="main"
        aria-label="Fiche du contact actif"
      >
        <EmptyState
          title="Aucun contact sélectionné"
          description="Sélectionnez un contact dans la file d'attente pour afficher sa fiche et consigner l'appel."
        />
      </main>
    );
  }

  const contextApplies = Boolean(
    contactContext && contextContactId === contact.id,
  );
  const sfContactUrl =
    contextApplies && contactContext?.contact_record_url
      ? contactContext.contact_record_url
      : contact.sf_contact_url ??
        (contact.sf_contact_id
          ? `https://salesforce.com/${contact.sf_contact_id}`
          : null);

  const handleSubmit = () => {
    if (!contact) return;
    const payload: LogPayload = {
      resultat,
      comments: comments.trim(),
      recallAt: scheduleRecall && recallAt ? recallAt : null,
      doNotCall,
    };
    onLogAndNext(contact.id, payload);
    // Reset ACW state
    setComments('');
    setDoNotCall(false);
  };

  const handleRdvSubmit = (
    start: string,
    durationMin: number,
    meta: { subject: string; ownerSfUserId: string | null },
  ) => {
    if (!contact) return;
    const payload: LogPayload = {
      resultat: 'RDV planifié',
      comments: comments.trim(),
      recallAt: null,
      doNotCall: false,
    };
    if (onLogRdvAndNext) {
      onLogRdvAndNext(contact.id, payload, {
        start,
        durationMin,
        subject: meta.subject,
        ownerSfUserId: meta.ownerSfUserId,
      });
    } else {
      onLogAndNext(contact.id, payload);
    }
    setComments('');
  };

  return (
    <main
      className="calls-workspace__contact"
      role="main"
      aria-label="Fiche du contact actif"
    >
      {/* 1. Fiche contact active : identité + actions appel séquentielles */}
      <div className="calls-workspace__contact-card-wrapper">
        <ContactCardPanel
          contact={contact}
          className="calls-contact-card"
          showCheckmark={false}
          displayTitle={contact.title ?? null}
          displayEmail={contact.email ?? null}
          sfContactUrl={sfContactUrl}
          contextApplies={contextApplies}
          contextBusy={loading}
          contactContext={contextApplies ? contactContext : null}
          isRecallQueue={false}
          onUpdateRecall={onUpdateRecall ?? (() => {})}
        />
      </div>

      {/* 2. ACW : résultat, rappel, RDV, commentaire (jamais fusionné avec le CRM) */}
      <section
        className="calls-workspace__acw"
        role="region"
        aria-label="Consignation de l'appel"
      >
        {awaitingEvent ? (
          <EventPanel
            key={awaitingEvent.id}
            contactName={awaitingEvent.contact_name}
            loading={loading}
            onSubmit={(
              start: string,
              durationMin: number,
              meta: { subject: string; ownerSfUserId: string | null },
            ) => {
              if (onFinalizeEvent) {
                onFinalizeEvent({
                  start,
                  durationMin,
                  subject: meta.subject,
                  ownerSfUserId: meta.ownerSfUserId,
                });
              }
            }}
            heading={`Finaliser le RDV — ${awaitingEvent.contact_name}`}
            team={team}
            sessionType={sessionType}
            currentSfUserId={currentSfUserId}
            accountCustomerType={
              contextApplies
                ? (contactContext?.account_customer_type ?? null)
                : null
            }
            defaultOwnerSfUserId={
              contextApplies
                ? (contactContext?.account_owner_sf_user_id ?? null)
                : null
            }
          />
        ) : contact.status === 'pending' ? (
          <GlassCard className="calls-acw-card">
            <h3 className="calls-acw__title">Consigner l&apos;appel</h3>

            <div className="calls-acw__control">
              <span className="calls-acw__label">Résultat</span>
              <ResultButtons value={resultat} onChange={setResultat} />
            </div>

            {resultat === 'RDV planifié' ? (
              <EventPanel
                key={contact.id}
                contactName={contact.contact_name}
                loading={loading}
                onSubmit={handleRdvSubmit}
                team={team}
                sessionType={sessionType}
                currentSfUserId={currentSfUserId}
                accountCustomerType={
                  contextApplies
                    ? (contactContext?.account_customer_type ?? null)
                    : null
                }
                defaultOwnerSfUserId={
                  contextApplies
                    ? (contactContext?.account_owner_sf_user_id ?? null)
                    : null
                }
              />
            ) : (
              <>
                <RecallFields
                  resultat={resultat}
                  scheduleRecall={scheduleRecall}
                  onScheduleRecallChange={setScheduleRecall}
                  recallAt={recallAt}
                  onRecallAtChange={setRecallAt}
                  onDefaultRecallDaysChange={() => {}}
                />

                <Checkbox
                  checked={doNotCall}
                  onChange={setDoNotCall}
                  aria-label="Ne pas rappeler (NPA)"
                  label="Ne pas rappeler (NPA)"
                  className="calls-checkbox calls-acw__checkbox"
                />

                <div className="calls-acw__field">
                  <label htmlFor="acw-comments" className="calls-acw__label">
                    Commentaires
                  </label>
                  <textarea
                    id="acw-comments"
                    className="calls-textarea calls-acw__textarea"
                    value={comments}
                    onChange={(e) => setComments(e.target.value)}
                    rows={3}
                    placeholder="Notes sur l'appel…"
                  />
                </div>

                {/* Un CTA primaire unique par état (Plan §1 & D4) — sticky CTA mobile (calls-workspace__sticky-bar) */}
                <div className="calls-acw__actions calls-workspace__sticky-bar">
                  <Button
                    variant="primary"
                    size="lg"
                    className="calls-acw__submit-cta"
                    onClick={handleSubmit}
                  >
                    Consigner &amp; suivant
                  </Button>
                </div>
              </>
            )}
          </GlassCard>
        ) : (
          <GlassCard className="calls-acw-card calls-acw-card--done">
            <div className="calls-acw__done-header">
              <Tag variant="success">Consigné</Tag>
              <span className="calls-acw__done-outcome">
                {contact.outcome ?? 'Appelé'}
              </span>
            </div>
            {contact.comments && (
              <p className="calls-acw__done-comments">{contact.comments}</p>
            )}
          </GlassCard>
        )}
      </section>
    </main>
  );
}
