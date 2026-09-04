import { useEffect, useMemo, useRef, useState } from 'react';
import { EmptyState, GlassCard, Skeleton } from '../../../../../components/ui';
import { RunnerView } from '../RunnerView';
import { ContactWorkspace } from './ContactWorkspace';
import { ContextInspector } from './ContextInspector';
import { PowerWorkspace } from './PowerWorkspace';
import { SessionHeader } from './SessionHeader';
import { SessionQueue } from './SessionQueue';
import type { SessionWorkspaceProps } from './types';
import { useSessionPowerPool } from './useSessionPowerPool';

/**
 * Surface SessionWorkspace V2 complète (Issue #119 - Lot L2).
 *
 * Règles impératives :
 * 1. ZÉRO toggle Liste/Fiche dans la V2 (D1).
 * 2. Structure 3 colonnes desktop (≥900px), 2 colonnes intermédiaire (720-899px),
 *    1 zone + sheets mobile (<720px).
 * 3. Rail replié en conversation Power et en ACW (Plan §1 & Grok note b).
 * 4. Façade V2 force LEGACY quand variant==='recalls' (Grok note a).
 * 5. Ne JAMAIS appeler assertValidPowerUiTransition en render (Grok note c).
 */
export function SessionWorkspaceV2(props: SessionWorkspaceProps) {
  const {
    session,
    contacts,
    loading,
    error,
    currentContact,
    focusedContactId,
    variant,
    awaitingEvent,
    contactContext,
    contextContactId,
    contextTargetContactId,
    onBack,
    onPin,
    onShareSession,
    onFocusContact,
    onLogAndNext,
    onLogRdvAndNext,
    onLogEvent,
    onUpdateRecall,
    onCelebrateGoal,
    team = [],
    currentSfUserId = null,
    currentUserId = null,
    canPowerDialer = false,
  } = props;

  // Contact actif : props.focusedContactId prioritaire, puis awaitingEvent, puis currentContact, puis 1er contact
  const [internalFocusedId, setInternalFocusedId] = useState<number | null>(
    () =>
      awaitingEvent?.id ??
      focusedContactId ??
      currentContact?.id ??
      (contacts[0]?.id ?? null),
  );

  // Bootstrap initial : si aucun focus explicite, focaliser le contact courant pour déclencher claim & contexte
  const bootstrappedRef = useRef(false);
  useEffect(() => {
    if (bootstrappedRef.current) return;
    if (focusedContactId != null) {
      bootstrappedRef.current = true;
      return;
    }
    if (currentContact && currentContact.status === 'pending') {
      bootstrappedRef.current = true;
      onFocusContact(currentContact.id);
    }
  }, [focusedContactId, currentContact, onFocusContact]);

  // Synchronisation du focus lors du changement des props
  useEffect(() => {
    if (awaitingEvent?.id != null) {
      setInternalFocusedId(awaitingEvent.id);
      return;
    }
    if (focusedContactId != null) {
      setInternalFocusedId(focusedContactId);
      return;
    }
    if (currentContact?.id != null) {
      setInternalFocusedId(currentContact.id);
    } else {
      setInternalFocusedId((prev) => {
        if (prev != null && contacts.some((c) => c.id === prev)) return prev;
        return contacts[0]?.id ?? null;
      });
    }
  }, [awaitingEvent?.id, focusedContactId, currentContact?.id, contacts]);

  const focusedContact = useMemo(() => {
    if (awaitingEvent) return awaitingEvent;
    if (!contacts.length) return null;
    if (internalFocusedId != null) {
      return (
        contacts.find((c) => c.id === internalFocusedId) ??
        currentContact ??
        contacts[0] ??
        null
      );
    }
    return currentContact ?? contacts[0] ?? null;
  }, [awaitingEvent, contacts, currentContact, internalFocusedId]);

  // Machine Power réelle dérivée des booléens du pool (Lot L4)
  const powerPool = useSessionPowerPool({
    token: props.token,
    sessionId: session.id,
    contacts,
    currentUserId,
    canPowerDialer,
    onFocusContact: (id) => {
      if (awaitingEvent) return;
      setInternalFocusedId(id);
      onFocusContact(id);
    },
    onBack,
    initialPowerOn: props.initialPowerOn,
  });

  const {
    isPowerActive,
    togglePower,
    powerViewModel,
    projectedQueue,
    parallelism,
    setParallelism,
    callerNumber,
    setCallerNumber,
    callerNumbers,
    quota,
    lines,
    byPhone,
    error: powerError,
    agentConnected,
    launching,
    hasAttempted,
    onLaunch,
    onHangupAll,
    onSkip,
    onRetryHangup,
    notifyLogged,
    requestExit,
  } = powerPool;

  // Sheets responsive pour <900px et <720px
  const [isInspectorSheetOpen, setIsInspectorSheetOpen] = useState(false);
  const [isQueueSheetOpen, setIsQueueSheetOpen] = useState(false);
  const [isPowerSheetOpen, setIsPowerSheetOpen] = useState(false);

  // Grok note a : la file de rappels n'est pas paritaire -> forcer le legacy
  if (variant === 'recalls') {
    return <RunnerView {...props} />;
  }

  const handleFocusContact = (id: number) => {
    // I5 lock focus : pendant awaitingEvent, la file est inerte jusqu'à finalisation
    if (awaitingEvent) return;
    setInternalFocusedId(id);
    onFocusContact(id);
  };

  const isQueueCollapsed = powerViewModel.isQueueCollapsed;

  return (
    <div
      className={`calls-view calls-view--runner calls-workspace--v2 ${isQueueCollapsed ? 'calls-workspace--queue-collapsed' : ''}`}
      data-testid="session-workspace-v2"
      role="region"
      aria-label={`Séance V2 : ${session.name}`}
    >
      {/* 1. HUD Séance condensé */}
      {/* Audio RTC agent Telnyx : hissé à ce niveau, instance unique toujours montée
          tant que Power est actif — indépendant des états conversation/acw (correctif B1 Opus) */}
      {isPowerActive && (
        <audio
          data-rtc-agent=""
          autoPlay
          muted={!agentConnected}
          className="calls-dialer__rtc-audio"
        />
      )}
      <SessionHeader
        session={session}
        contacts={contacts}
        onBack={requestExit}
        onPin={onPin}
        onShareSession={onShareSession}
        team={team}
        currentUserId={currentUserId}
        canPowerDialer={canPowerDialer}
        isPowerActive={isPowerActive}
        onTogglePower={togglePower}
        onTogglePowerSheet={() => setIsPowerSheetOpen(true)}
        isPowerSheetOpen={isPowerSheetOpen}
        onToggleInspectorSheet={() => setIsInspectorSheetOpen(true)}
        isInspectorSheetOpen={isInspectorSheetOpen}
        onToggleQueueSheet={() => setIsQueueSheetOpen(true)}
        isQueueSheetOpen={isQueueSheetOpen}
      />
      {/* 2. Corps du workspace */}
      <div className="calls-workspace__body">
        {loading && contacts.length === 0 ? (
          <div className="calls-workspace__loading" role="status">
            <Skeleton height="3rem" />
            <Skeleton height="15rem" />
          </div>
        ) : error && contacts.length === 0 ? (
          <GlassCard className="calls-workspace__error calls-error" role="alert">
            <p aria-live="assertive">{error}</p>
          </GlassCard>
        ) : contacts.length === 0 ? (
          <EmptyState
            title="Séance vide"
            description="Aucun contact dans cette séance."
          />
        ) : (
          <>
            {error && (
              <GlassCard
                className="calls-workspace__error calls-error"
                role="alert"
              >
                <p aria-live="assertive">{error}</p>
              </GlassCard>
            )}

            {/* Console opérationnelle Power sur desktop */}
            <PowerWorkspace
              isPowerActive={isPowerActive}
              powerUiState={powerViewModel.state}
              projectedQueue={projectedQueue}
              canPowerDialer={canPowerDialer}
              onTogglePower={togglePower}
              parallelism={parallelism}
              onParallelismChange={setParallelism}
              callerNumber={callerNumber}
              onCallerNumberChange={setCallerNumber}
              callerNumbers={callerNumbers}
              quota={quota}
              lines={lines}
              byPhone={byPhone}
              error={powerError}
              launching={launching}
              hasAttempted={hasAttempted}
              onLaunch={onLaunch}
              onHangupAll={onHangupAll}
              onSkip={onSkip}
              onRetryHangup={onRetryHangup}
            />

            <div className="calls-workspace__layout">
            {/* Colonne 1 : File persistante (Queue) */}
            <SessionQueue
              contacts={contacts}
              focusedContactId={focusedContact?.id}
              onFocusContact={handleFocusContact}
              isPowerActive={isPowerActive}
              projectedPowerQueue={projectedQueue}
              isCollapsed={isQueueCollapsed}
            />

            {/* Colonne 2 : Contact actif + ACW */}
            <ContactWorkspace
              contact={focusedContact}
              contactContext={contactContext}
              contextContactId={contextContactId}
              contextTargetContactId={contextTargetContactId}
              loading={loading}
              onFocusContact={handleFocusContact}
              onLogAndNext={(contactId, payload) => {
                notifyLogged();
                onLogAndNext(contactId, payload);
              }}
              onLogRdvAndNext={(contactId, payload, event) => {
                notifyLogged();
                onLogRdvAndNext?.(contactId, payload, event);
              }}
              onLogEvent={onLogEvent}
              onCelebrateGoal={onCelebrateGoal}
              onUpdateRecall={onUpdateRecall}
              team={team}
              currentSfUserId={currentSfUserId}
              sessionType={session.session_type}
              awaitingEvent={awaitingEvent}
              isCallBarHidden={powerViewModel.isCallBarHidden}
              onHangupAll={onHangupAll}
              isPowerConversation={powerViewModel.state === 'conversation'}
            />

            {/* Colonne 3 : Contexte CRM en lecture */}
            <ContextInspector
              contactContext={contactContext}
              contextContactId={contextContactId}
              contextTargetContactId={contextTargetContactId}
              loading={loading}
              contact={focusedContact}
            />
          </div>
        </>
        )}
      </div>

      {/* Sheets responsive : Inspecteur (<900px) */}
      {isInspectorSheetOpen && (
        <div
          className="calls-workspace__sheet-backdrop"
          onClick={() => setIsInspectorSheetOpen(false)}
        >
          <div onClick={(e) => e.stopPropagation()}>
            <ContextInspector
              contactContext={contactContext}
              contextContactId={contextContactId}
              contextTargetContactId={contextTargetContactId}
              loading={loading}
              contact={focusedContact}
              isSheet
              onCloseSheet={() => setIsInspectorSheetOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Sheets responsive : File (<720px) */}
      {isQueueSheetOpen && (
        <div
          className="calls-workspace__sheet-backdrop"
          onClick={() => setIsQueueSheetOpen(false)}
        >
          <div onClick={(e) => e.stopPropagation()}>
            <SessionQueue
              contacts={contacts}
              focusedContactId={focusedContact?.id}
              onFocusContact={(id) => {
                handleFocusContact(id);
                setIsQueueSheetOpen(false);
              }}
              isPowerActive={isPowerActive}
              projectedPowerQueue={projectedQueue}
              isSheet
              onCloseSheet={() => setIsQueueSheetOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Sheets responsive : Power (<720px) */}
      {isPowerSheetOpen && (
        <div
          className="calls-workspace__sheet-backdrop"
          onClick={() => setIsPowerSheetOpen(false)}
        >
          <div onClick={(e) => e.stopPropagation()}>
            <PowerWorkspace
              isPowerActive={isPowerActive}
              powerUiState={powerViewModel.state}
              projectedQueue={projectedQueue}
              canPowerDialer={canPowerDialer}
              onTogglePower={togglePower}
              parallelism={parallelism}
              onParallelismChange={setParallelism}
              callerNumber={callerNumber}
              onCallerNumberChange={setCallerNumber}
              callerNumbers={callerNumbers}
              quota={quota}
              lines={lines}
              byPhone={byPhone}
              error={powerError}
              launching={launching}
              hasAttempted={hasAttempted}
              onLaunch={onLaunch}
              onHangupAll={onHangupAll}
              onSkip={onSkip}
              onRetryHangup={onRetryHangup}
              isSheet
              onCloseSheet={() => setIsPowerSheetOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
