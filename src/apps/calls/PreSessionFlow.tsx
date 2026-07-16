import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, GlassCard } from '../../components/ui';
import { useComboOverlay } from './comboOverlay';
import type { SessionContact, SessionDetail } from './types';

type PreSessionFlowProps = {
  session: SessionDetail;
  contacts: SessionContact[];
  loading?: boolean;
  onLaunch: (goal: number) => Promise<void>;
  onCancel: () => void;
};

type Phase = 'briefing' | 'activation';
type HandoffState = 'idle' | 'launching' | 'error';

const OBJECTIVE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

function accountGroups(contacts: SessionContact[]) {
  const groups = new Map<
    string,
    { name: string; contacts: SessionContact[] }
  >();
  for (const contact of contacts) {
    const key =
      contact.sf_account_id || contact.account_name || `contact-${contact.id}`;
    const current = groups.get(key) || {
      name: contact.account_name || 'Compte non renseigné',
      contacts: [],
    };
    current.contacts.push(contact);
    groups.set(key, current);
  }
  return [...groups.values()];
}

export function PreSessionFlow({
  session,
  contacts,
  loading = false,
  onLaunch,
  onCancel,
}: PreSessionFlowProps) {
  const [phase, setPhase] = useState<Phase>('briefing');
  const [goal, setGoal] = useState<number | undefined>(session.rdv_goal ?? 5);
  const [countdown, setCountdown] = useState(3);
  const [handoffState, setHandoffState] = useState<HandoffState>('idle');
  const [launchError, setLaunchError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const phaseTitleRef = useRef<HTMLHeadingElement>(null);
  const launchStartedRef = useRef(false);
  const previousPhaseRef = useRef<Phase>('briefing');
  const groups = useMemo(() => accountGroups(contacts), [contacts]);
  const remaining = contacts.filter(
    (contact) => contact.status === 'pending',
  ).length;
  const validGoal =
    typeof goal === 'number' && Number.isInteger(goal) && goal >= 1 && goal <= 8
      ? goal
      : null;

  useComboOverlay(true, panelRef, onCancel);

  useEffect(() => {
    if (phase !== 'activation') return undefined;
    setCountdown(3);
    setHandoffState('idle');
    setLaunchError(null);
    launchStartedRef.current = false;
    const timer = window.setInterval(() => {
      setCountdown((value) => {
        if (value <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return value - 1;
      });
    }, 700);
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (previousPhaseRef.current === phase) return undefined;
    previousPhaseRef.current = phase;
    const focusTimer = window.setTimeout(
      () => phaseTitleRef.current?.focus(),
      0,
    );
    return () => window.clearTimeout(focusTimer);
  }, [phase]);

  const launch = useCallback(
    async (goalToLaunch: number) => {
      if (launchStartedRef.current) return;
      launchStartedRef.current = true;
      setLaunchError(null);
      setHandoffState('launching');
      try {
        await onLaunch(goalToLaunch);
      } catch {
        launchStartedRef.current = false;
        setHandoffState('error');
        setLaunchError(
          'Le départ n’a pas abouti. Vérifie la connexion puis relance.',
        );
      }
    },
    [onLaunch],
  );

  useEffect(() => {
    if (
      phase !== 'activation' ||
      countdown !== 0 ||
      validGoal === null ||
      handoffState === 'error'
    )
      return;
    void launch(validGoal);
  }, [countdown, handoffState, launch, phase, validGoal]);

  return (
    <div
      ref={panelRef}
      className="calls-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby={
        phase === 'briefing' ? 'calls-pre-session-title' : undefined
      }
      aria-label={phase === 'activation' ? 'Activation de la séance' : undefined}
    >
      <GlassCard
        className={`calls-modal__panel calls-pre-session calls-pre-session--${phase}${handoffState === 'launching' ? ' calls-pre-session--handoff' : ''}`}
      >
        {phase === 'briefing' && (
          <section
            className="calls-pre-session__briefing"
            aria-labelledby="calls-pre-session-title"
          >
            <div className="calls-pre-session__briefing-head">
              <div>
                <div className="calls-pre-session__eyebrow">Brief opérateur</div>
                <p className="calls-pre-session__session-name">{session.name}</p>
                <h2 id="calls-pre-session-title" ref={phaseTitleRef} tabIndex={-1}>
                  Aujourd’hui, tu appelles
                </h2>
                <p className="calls-pre-session__briefing-copy">
                  {remaining} contact{remaining > 1 ? 's' : ''} à appeler. Prépare le
                  premier appel.
                </p>
              </div>
              <div className="calls-pre-session__stats" aria-label="Comptes et contacts à appeler">
                <div className="calls-pre-session__stat">
                  <strong>{remaining}</strong>
                  <span>contacts à appeler</span>
                </div>
                <div className="calls-pre-session__stat">
                  <strong>{groups.length}</strong>
                  <span>comptes</span>
                </div>
                <div className="calls-pre-session__stat">
                  <strong>{contacts.length}</strong>
                  <span>contacts au total</span>
                </div>
              </div>
            </div>

            <div className="calls-pre-session__briefing-grid">
              <div className="calls-pre-session__lineup">
                <div className="calls-pre-session__section-heading">
                  <h3>Comptes à appeler</h3>
                  <span>{groups.length}</span>
                </div>
                <ul className="calls-context-list calls-pre-session__accounts">
                  {groups.map((group) => {
                    const latest = [...group.contacts].sort((a, b) =>
                      String(b.called_at || '').localeCompare(
                        String(a.called_at || ''),
                      ),
                    )[0];
                    return (
                      <li key={group.name}>
                        <strong>{group.name}</strong>
                        <span>
                          {group.contacts.length} contact
                          {group.contacts.length > 1 ? 's' : ''}
                        </span>
                        <small>
                          {latest?.outcome
                            ? `Dernier résultat : ${latest.outcome}`
                            : 'Prêt pour le premier appel'}
                        </small>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="calls-pre-session__objective">
                <div className="calls-pre-session__section-heading">
                  <h3>Objectif RDV</h3>
                  <span>séance</span>
                </div>
                <div
                  className="calls-pre-session__objective-options"
                  role="group"
                  aria-label="Objectif de rendez-vous"
                >
                  {OBJECTIVE_OPTIONS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={`calls-pre-session__objective-chip${goal === option ? ' calls-pre-session__objective-chip--active' : ''}`}
                      aria-label={`${option} RDV`}
                      aria-pressed={goal === option}
                      onClick={() => setGoal(option)}
                    >
                      <strong>{option}</strong>
                      <span>RDV</span>
                    </button>
                  ))}
                </div>
                <p className="calls-pre-session__objective-hint" aria-live="polite">
                  {validGoal === null
                    ? 'Choisis un nombre entier entre 1 et 8 RDV.'
                    : `Objectif RDV : ${validGoal}`}
                </p>
              </div>
            </div>

            <div className="calls-pre-session__actions">
              <Button
                onClick={() => validGoal !== null && setPhase('activation')}
                disabled={validGoal === null}
              >
                Préparer le départ
              </Button>
              <Button variant="secondary" onClick={onCancel}>
                Annuler
              </Button>
            </div>
          </section>
        )}

        {phase === 'activation' && (
          <section
            className="calls-pre-session__activation"
            role="status"
            aria-live="polite"
            aria-atomic="true"
            aria-busy={handoffState === 'launching' || loading}
            aria-labelledby="calls-pre-session-activation-title"
          >
            <div className="calls-pre-session__activation-objective">
              <span>Objectif RDV</span>
              <strong id="calls-pre-session-activation-title">
                {validGoal ?? '—'}
              </strong>
            </div>
            <div
              className={`calls-pre-session__countdown${countdown === 0 ? ' calls-pre-session__countdown--go' : ''}`}
              aria-label={
                countdown > 0 ? `Départ dans ${countdown}` : 'Départ'
              }
            >
              {countdown > 0 ? countdown : 'GO'}
            </div>
            {countdown > 0 && <p>Départ dans {countdown}.</p>}
            {countdown === 0 && handoffState === 'launching' && (
              <p>Ouverture de la séance…</p>
            )}
            {countdown === 0 && handoffState === 'error' && (
              <div
                className="calls-pre-session__launch-error"
                role="alert"
                aria-label="Échec du départ"
              >
                <p>{launchError}</p>
                <Button
                  className="calls-pre-session__ignition"
                  onClick={() => validGoal !== null && void launch(validGoal)}
                  disabled={loading}
                >
                  Relancer le départ
                </Button>
              </div>
            )}
          </section>
        )}
      </GlassCard>
    </div>
  );
}
