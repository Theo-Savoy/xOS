import { useState } from "react";
import { Button, GlassCard } from "../../components/ui";
import { TagInput } from "./filterControls";

type EventPanelProps = {
  contactName: string;
  loading: boolean;
  onSubmit: (start: string, durationMin: number, invitees: string[]) => void;
};

function defaultStart(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  return d.toISOString().slice(0, 16);
}

export function EventPanel({ contactName, loading, onSubmit }: EventPanelProps) {
  const [start, setStart] = useState(defaultStart());
  const [durationMin, setDurationMin] = useState(30);
  const [invitees, setInvitees] = useState<string[]>([]);

  const handleSubmit = () => {
    if (!start) return;
    onSubmit(new Date(start).toISOString(), durationMin, invitees);
  };

  return (
    <GlassCard className="calls-event-panel">
      <h3>RDV planifié — {contactName}</h3>
      <div className="calls-fb-row">
        <label className="calls-field">
          <span>Date &amp; heure</span>
          <input
            type="datetime-local"
            className="calls-input"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </label>
        <label className="calls-field">
          <span>Durée (min)</span>
          <input
            type="number"
            min={5}
            step={5}
            className="calls-input"
            value={durationMin}
            onChange={(e) => setDurationMin(Number(e.target.value) || 0)}
          />
        </label>
      </div>
      <TagInput
        label="Invités additionnels"
        hint="emails"
        value={invitees}
        onChange={setInvitees}
        placeholder="email@exemple.com"
      />
      <Button onClick={handleSubmit} disabled={loading || !start}>
        {loading ? "Enregistrement…" : "Enregistrer le RDV & suivant"}
      </Button>
    </GlassCard>
  );
}
