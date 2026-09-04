import { useEffect, useMemo, useState } from 'react';
import { EmptyState, GlassCard, Skeleton } from '../../../../../components/ui';
import { RunnerView } from '../RunnerView';
import { ContactWorkspace } from './ContactWorkspace';
import { ContextInspector } from './ContextInspector';
import { derivePowerViewModel, projectPowerQueue } from './powerUiState';
import { PowerWorkspace } from './PowerWorkspace';
import { SessionHeader } from './SessionHeader';
import { SessionQueue } from './SessionQueue';
import type { SessionWorkspaceProps } from './types';

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
    onBack,
    onPin,
    onShareSession,
    onFocusContact,
    onLogAndNext,
    onLogRdvAndNext,
    onUpdateRecall,
    team = [],
    currentSfUserId = null,
    currentUserId = null,
    canPowerDialer = false,
  } = props;

  // Contact actif : props.focusedContactId prioritaire, puis currentContact, puis 1er contact
  const [internalFocusedId, setInternalFocusedId] = useState<number | null>(
    () => focusedContactId ?? currentContact?.id ?? (contacts[0]?.id ?? null),
  );

  useEffect(() => {
    if (focusedContactId != null) {
      setInternalFocusedId(focusedContactId);
    } else if (currentContact?.id != null) {
      setInternalFocusedId(currentContact.id);
    }
  }, [focusedContactId, currentContact?.id]);

  const focusedContact = useMemo(() => {
    if (!contacts.length) return null;
    return (
      contacts.find((c) => c.id === internalFocusedId) ?? contacts[0] ?? null
    );
  }, [contacts, internalFocusedId]);

  // Gestion du mode Power (placeholder L2)
  const [isPowerActive, setIsPowerActive] = useState(false);

  // Projection unique de la file Power (Plan §2 & I9)
  const projectedQueue = useMemo(() => {
    return projectPowerQueue(contacts, currentUserId);
  }, [contacts, currentUserId]);

  // Vue modèle pure dérivée (Grok note c : pas d'assertValidPowerUiTransition au render)
  const powerViewModel = useMemo(() => {
    return derivePowerViewModel({
      powerOn: isPowerActive,
      powerAvailable: canPowerDialer,
      hasConnectedLine: false,
      isAcw: false,
      isRunning: false,
      hangupRetryable: false,
    });
  }, [isPowerActive, canPowerDialer]);

  // Sheets responsive pour <900px et <720px
  const [isInspectorSheetOpen, setIsInspectorSheetOpen] = useState(false);
  const [isQueueSheetOpen, setIsQueueSheetOpen] = useState(false);
  const [isPowerSheetOpen, setIsPowerSheetOpen] = useState(false);

  // Grok note a : la file de rappels n'est pas paritaire -> forcer le legacy
  if (variant === 'recalls') {
    return <RunnerView {...props} />;
  }

  const handleFocusContact = (id: number) => {
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
      <SessionHeader
        session={session}
        contacts={contacts}
        onBack={onBack}
        onPin={onPin}
        onShareSession={onShareSession}
        team={team}
        currentUserId={currentUserId}
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
        ) : error ? (
          <GlassCard className="calls-workspace__error" role="alert">
            <p>{error}</p>
          </GlassCard>
        ) : contacts.length === 0 ? (
          <EmptyState
            title="Séance vide"
            description="Aucun contact dans cette séance."
          />
        ) : (
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
              loading={loading}
              onFocusContact={handleFocusContact}
              onLogAndNext={onLogAndNext}
              onLogRdvAndNext={onLogRdvAndNext}
              onUpdateRecall={onUpdateRecall}
              team={team}
              currentSfUserId={currentSfUserId}
              sessionType={session.session_type}
              awaitingEvent={awaitingEvent}
            />

            {/* Colonne 3 : Contexte CRM en lecture */}
            <ContextInspector
              contactContext={contactContext}
              loading={loading}
              contact={focusedContact}
            />
          </div>
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
              onTogglePower={() => setIsPowerActive((prev) => !prev)}
              canPowerDialer={canPowerDialer}
              isSheet
              onCloseSheet={() => setIsPowerSheetOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
