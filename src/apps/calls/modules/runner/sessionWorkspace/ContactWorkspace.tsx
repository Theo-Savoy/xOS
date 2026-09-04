import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useState,
} from 'react';
import { Button, Checkbox, EmptyState, GlassCard, Tag } from '../../../../../components/ui';
import {
  RELANCE_DEFAULT_RESULTATS,
  type ResultatCall,
} from '../../../../../crm';
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
import { addDaysIso, readDefaultRecallDays } from '../runnerFormatters';
import type { LogPayload } from '../RunnerView.types';
export interface ContactWorkspaceProps {
  contact: SessionContact | null;
  contactContext: ContactContext | null;
  contextContactId: number | null;
  contextTargetContactId?: number | null;
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
  onLogEvent?: (
    start: string,
    durationMin: number,
    meta: { subject: string; ownerSfUserId: string | null },
  ) => void;
  onCelebrateGoal?: (payload: { goal: number; count: number }) => void;
  /** Masquage de l'action d'appel séquentiel / CallBar quand Power est actif */
  isCallBarHidden?: boolean;
  /** Raccrochage Power (correctif B3 Opus) : rendu disponible en conversation, hors panel démonté */
  onHangupAll?: () => void;
  /** État conversation Power : expose le Raccrocher danger à côté de la consignation */
  isPowerConversation?: boolean;
}

export type ContactWorkspaceHandle = {
  pickResult: (resultat: ResultatCall) => boolean;
  submit: () => boolean;
};

export const ContactWorkspace = forwardRef<
  ContactWorkspaceHandle,
  ContactWorkspaceProps
>(function ContactWorkspace(
  {
    contact,
    contactContext,
    contextContactId,
    contextTargetContactId,
    loading,
    onLogAndNext,
    onLogRdvAndNext,
    onUpdateRecall,
    team = [],
    currentSfUserId = null,
    sessionType,
    awaitingEvent,
    onFinalizeEvent,
    onLogEvent,
    isCallBarHidden = false,
    onHangupAll,
    isPowerConversation = false,
  },
  ref,
) {
  const [resultat, setResultat] = useState<ResultatCall>(
    RESULTAT_OPTIONS[0].value,
  );
  const [comments, setComments] = useState('');
  const [recallAt, setRecallAt] = useState(() =>
    addDaysIso(readDefaultRecallDays()),
  );
  const [scheduleRecall, setScheduleRecall] = useState(() =>
    RELANCE_DEFAULT_RESULTATS.includes(RESULTAT_OPTIONS[0].value),
  );
  const [doNotCall, setDoNotCall] = useState(false);

  // Synchronisation de l'ACW au changement de contact actif
  useEffect(() => {
    setResultat(RESULTAT_OPTIONS[0].value);
    setComments('');
    setDoNotCall(false);
    setScheduleRecall(
      RELANCE_DEFAULT_RESULTATS.includes(RESULTAT_OPTIONS[0].value),
    );
    setRecallAt(addDaysIso(readDefaultRecallDays()));
  }, [contact?.id]);

  // Synchronisation du rappel par défaut lors du changement de résultat
  useEffect(() => {
    setScheduleRecall(RELANCE_DEFAULT_RESULTATS.includes(resultat));
  }, [resultat]);

  const handleSubmit = useCallback(() => {
    if (
      !contact ||
      loading ||
      awaitingEvent ||
      contact.status !== 'pending' ||
      resultat === 'RDV planifié'
    ) {
      return false;
    }
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
    return true;
  }, [
    awaitingEvent,
    comments,
    contact,
    doNotCall,
    loading,
    onLogAndNext,
    recallAt,
    resultat,
    scheduleRecall,
  ]);

  useImperativeHandle(
    ref,
    () => ({
      pickResult: (nextResultat) => {
        if (
          !contact ||
          loading ||
          awaitingEvent ||
          contact.status !== 'pending'
        ) {
          return false;
        }
        setResultat(nextResultat);
        return true;
      },
      submit: handleSubmit,
    }),
    [awaitingEvent, contact, handleSubmit, loading],
  );

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
    contactContext &&
      contact &&
      contextContactId != null &&
      contextContactId === contact.id,
  );
  const contextBusy = Boolean(
    loading ||
      (contact &&
        contextTargetContactId === contact.id &&
        contextContactId !== contact.id),
  );
  const sfContactUrl =
    contextApplies && contactContext?.contact_record_url
      ? contactContext.contact_record_url
      : contact.sf_contact_url ??
        (contact.sf_contact_id
          ? `https://salesforce.com/${contact.sf_contact_id}`
          : null);

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
  const handleDefaultRecallDaysChange = (days: number) => {
    // Producteur de défaut rappel : persisté dans localStorage et met à jour recallAt
    try {
      localStorage.setItem('xos_calls_default_recall_days', String(days));
    } catch {
      /* ignore */
    }
    setRecallAt(addDaysIso(days));
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
          contextBusy={contextBusy}
          contactContext={contextApplies ? contactContext : null}
          isRecallQueue={false}
          onUpdateRecall={onUpdateRecall ?? (() => {})}
          isCallBarHidden={isCallBarHidden}
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
              if (onLogEvent) {
                onLogEvent(start, durationMin, meta);
              } else if (onFinalizeEvent) {
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
                submitLabel="Consigner appel + RDV & suivant"
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
                  onDefaultRecallDaysChange={handleDefaultRecallDaysChange}
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
                  {isPowerConversation && onHangupAll && (
                    <Button
                      variant="danger"
                      size="md"
                      className="calls-acw__hangup-cta"
                      onClick={onHangupAll}
                    >
                      Raccrocher
                    </Button>
                  )}
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
});
