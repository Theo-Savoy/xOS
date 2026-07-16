import { useEffect, useMemo, useRef, useState } from "react";
import { Button, GlassCard, Tag } from "../../components/ui";
import { useComboOverlay } from "./comboOverlay";
import type { SessionContact, SessionDetail } from "./types";

type PreSessionFlowProps = {
  session: SessionDetail;
  contacts: SessionContact[];
  loading?: boolean;
  onLaunch: (goal: number) => Promise<void>;
  onCancel: () => void;
};

type Phase = "review" | "objective" | "warmup";

const OBJECTIVE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
const PHASES: { id: Phase; label: string }[] = [
  { id: "review", label: "Revue" },
  { id: "objective", label: "Objectif" },
  { id: "warmup", label: "Activation" },
];
const PHASE_ORDER = PHASES.map((item) => item.id);

function accountGroups(contacts: SessionContact[]) {
  const groups = new Map<string, { name: string; contacts: SessionContact[] }>();
  for (const contact of contacts) {
    const key = contact.sf_account_id || contact.account_name || `contact-${contact.id}`;
    const current = groups.get(key) || { name: contact.account_name || "Compte non renseigné", contacts: [] };
    current.contacts.push(contact);
    groups.set(key, current);
  }
  return [...groups.values()];
}

export function PreSessionFlow({ session, contacts, loading = false, onLaunch, onCancel }: PreSessionFlowProps) {
  const [phase, setPhase] = useState<Phase>("review");
  const [goal, setGoal] = useState<number | undefined>(session.rdv_goal ?? 5);
  const [countdown, setCountdown] = useState(3);
  const panelRef = useRef<HTMLDivElement>(null);
  const groups = useMemo(() => accountGroups(contacts), [contacts]);
  const remaining = contacts.filter((contact) => contact.status === "pending").length;
  const validGoal = typeof goal === "number" && Number.isInteger(goal) && goal >= 1 && goal <= 8 ? goal : null;
  const phaseIndex = PHASE_ORDER.indexOf(phase);

  useComboOverlay(true, panelRef, onCancel);

  useEffect(() => {
    if (phase !== "warmup") return undefined;
    setCountdown(3);
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

  const launch = async () => {
    if (countdown !== 0 || validGoal === null) return;
    await onLaunch(validGoal);
  };

  return (
    <div ref={panelRef} className="calls-modal" role="dialog" aria-modal="true" aria-labelledby="calls-pre-session-title">
      <GlassCard className="calls-modal__panel calls-pre-session">
        <div className="calls-pre-session__eyebrow">Rituel de lancement</div>
        <h2 id="calls-pre-session-title">{session.name}</h2>
        <div className="calls-pre-session__rail">
          <ol className="calls-pre-session__phases" aria-label="Étapes de préparation">
            {PHASES.map((item, index) => {
              const state = index === phaseIndex ? "active" : index < phaseIndex ? "done" : "pending";
              return (
                <li
                  key={item.id}
                  aria-label={`${item.label}${phase === item.id ? " — en cours" : ""}`}
                  aria-current={phase === item.id ? "step" : undefined}
                  className={`calls-pre-session__phase calls-pre-session__phase--${state}`}
                >
                  <span>{state === "done" ? "✓" : index + 1}</span>
                  {item.label}
                </li>
              );
            })}
          </ol>
        </div>
        {phase === "review" && (
          <>
            <div className="calls-pre-session__manifest-head">
              <span className="calls-pre-session__manifest-tag">Manifeste</span>
              <p className="calls-muted">Vérifie la matière avant l’engagement. {remaining} contact{remaining > 1 ? "s" : ""} à traiter dans cette séance.</p>
            </div>
            <div className="calls-pre-session__stats">
              <Tag variant="accent">{groups.length} compte{groups.length > 1 ? "s" : ""}</Tag>
              <Tag>{remaining} contact{remaining > 1 ? "s" : ""} restant{remaining > 1 ? "s" : ""}</Tag>
              <Tag>{contacts.length} contact{contacts.length > 1 ? "s" : ""} au total</Tag>
            </div>
            <ul className="calls-context-list calls-pre-session__accounts">
              {groups.map((group) => {
                const latest = [...group.contacts].sort((a, b) => String(b.called_at || "").localeCompare(String(a.called_at || "")))[0];
                return (
                  <li key={group.name}>
                    <strong>{group.name}</strong>
                    <span>{group.contacts.length} contact{group.contacts.length > 1 ? "s" : ""}</span>
                    <small>{latest?.outcome ? `Dernier résultat : ${latest.outcome}` : "Jamais appelé dans cette séance"}</small>
                  </li>
                );
              })}
            </ul>
            <div className="calls-runner-actions">
              <Button onClick={() => setPhase("objective")}>Définir mon objectif</Button>
              <Button variant="secondary" onClick={onCancel}>Retour</Button>
            </div>
          </>
        )}
        {phase === "objective" && (
          <>
            <p id="calls-pre-session-objective-copy" className="calls-muted">Combien de rendez-vous veux-tu obtenir dans cette séance ? L’objectif sera verrouillé au lancement.</p>
            <div className="calls-pre-session__objective-picker" role="group" aria-label="Objectif de RDV">
              <span className="calls-pre-session__objective-label">Engagement d’objectif</span>
              <div className="calls-pre-session__objective-options">
                {OBJECTIVE_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={`calls-pre-session__objective-chip${goal === option ? " calls-pre-session__objective-chip--active" : ""}`}
                    aria-label={`${option} RDV`}
                    aria-pressed={goal === option}
                    onClick={() => setGoal(option)}
                  >
                    {goal === option && <span className="calls-pre-session__objective-glow" aria-hidden="true" />}
                    <strong>{option}</strong>
                    <span>RDV</span>
                  </button>
                ))}
              </div>
              <span id="calls-pre-session-goal-hint" className="calls-muted">
                {validGoal === null ? "Choisis un nombre entier entre 1 et 8 RDV." : `Objectif choisi : ${validGoal} RDV. Il sera verrouillé au lancement.`}
              </span>
            </div>
            <div className="calls-runner-actions">
              <Button onClick={() => setPhase("warmup")} disabled={validGoal === null}>Lancer le warmup</Button>
              <Button variant="secondary" onClick={() => setPhase("review")}>Retour</Button>
            </div>
          </>
        )}
        {phase === "warmup" && (
          <div className="calls-pre-session__warmup" role="status" aria-live="polite" aria-atomic="true">
            <div className="calls-pre-session__warmup-head">
              <span className="calls-pre-session__warmup-kicker">Phase 3 · Lancement</span>
              <strong className="calls-pre-session__warmup-title">On passe en mode conversation</strong>
            </div>
            <div className={countdown === 0 ? "calls-pre-session__stage calls-pre-session__stage--go" : "calls-pre-session__stage"}>
              {countdown > 0 ? (
                <div className="calls-pre-session__countdown calls-pre-session__countdown--pulse">{countdown}</div>
              ) : (
                <div className="calls-pre-session__countdown calls-pre-session__countdown--go">GO</div>
              )}
            </div>
            {countdown > 0 ? (
              <p>Respire. Une conversation à la fois. Ton cap : {validGoal ?? "—"} RDV.</p>
            ) : (
              <>
                <p>Objectif verrouillé : {validGoal ?? "—"} RDV.</p>
                <Button className="calls-pre-session__ignition" onClick={() => void launch()} disabled={loading}>Entrer dans la séance</Button>
              </>
            )}
            <div className="calls-pre-session__warmup-track" aria-hidden="true">
              <span className={countdown === 0 ? "calls-pre-session__warmup-progress calls-pre-session__warmup-progress--done" : "calls-pre-session__warmup-progress"} />
            </div>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
