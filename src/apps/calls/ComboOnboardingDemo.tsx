import { useEffect, useState } from "react";
import { Button, GlassCard } from "../../components/ui";
import { markComboDemoSeen } from "./comboKeyboard";
import { playComboSound, unlockComboAudio } from "./comboSounds";

type ComboOnboardingDemoProps = {
  open: boolean;
  onClose: () => void;
};

const BEATS = [
  { at: 0, title: "Combo", body: "Prospection au rythme du clavier.", sound: "demo" as const },
  { at: 4000, title: "1", body: "Résultat — Appel non décroché", sound: "tick" as const, chip: "Non décroché" },
  { at: 10000, title: "⇧3", body: "Rappel dans 3 jours", sound: "recall" as const, chip: "+3 j" },
  { at: 18000, title: "⌘↵", body: "Loggué · contact suivant", sound: "success" as const },
  { at: 26000, title: "⌘K · ?", body: "Toutes les actions, toujours sous la main.", sound: "whoosh" as const },
];

export function ComboOnboardingDemo({ open, onClose }: ComboOnboardingDemoProps) {
  const [elapsed, setElapsed] = useState(0);
  const [played, setPlayed] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    if (!open) return;
    setElapsed(0);
    setPlayed(new Set());
    void unlockComboAudio();
    const started = performance.now();
    const timer = window.setInterval(() => {
      setElapsed(performance.now() - started);
    }, 100);
    return () => window.clearInterval(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    for (const [index, beat] of BEATS.entries()) {
      if (elapsed < beat.at || played.has(index)) continue;
      setPlayed((prev) => new Set(prev).add(index));
      playComboSound(beat.sound);
    }
    if (elapsed > 35000) {
      markComboDemoSeen();
      onClose();
    }
  }, [elapsed, open, onClose, played]);

  if (!open) return null;

  const current = [...BEATS].reverse().find((beat) => elapsed >= beat.at) ?? BEATS[0];
  const progress = Math.min(1, elapsed / 35000);

  const finish = (skip: boolean) => {
    markComboDemoSeen();
    if (!skip) playComboSound("success");
    onClose();
  };

  return (
    <div className="calls-demo" role="dialog" aria-modal="true" aria-label="Démo Combo">
      <div className="calls-demo__stage">
        <GlassCard className="calls-demo__card">
          <p className="calls-demo__brand">Combo</p>
          <div className="calls-demo__key" aria-hidden="true">
            {current.title}
          </div>
          <h3>{current.body}</h3>
          {current.chip && <span className="calls-demo__chip">{current.chip}</span>}
          <div className="calls-demo__mock" aria-hidden="true">
            <div className="calls-demo__mock-row">
              <span className={elapsed >= 4000 ? "is-on" : undefined}>Non décroché</span>
              <span className={elapsed >= 10000 ? "is-on" : undefined}>+3 j</span>
            </div>
            <div className={`calls-demo__toast${elapsed >= 18000 ? " is-on" : ""}`}>Loggué · rappel +3 j</div>
          </div>
          <div className="calls-demo__progress" aria-hidden="true">
            <span style={{ width: `${progress * 100}%` }} />
          </div>
          <div className="calls-demo__actions">
            <Button variant="secondary" onClick={() => finish(true)}>
              Passer
            </Button>
            <Button onClick={() => finish(false)}>C&apos;est parti</Button>
          </div>
          <p className="calls-muted calls-demo__hint">Esc pour passer · rejouable via ⌘K</p>
        </GlassCard>
      </div>
    </div>
  );
}
