import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "../../auth/useSession";
import { WindowBootScreen } from "../../components/WindowBootScreen";
import { Button } from "../../components/ui";
import { todayParisIso } from "../../lib/dates";
import {
  fetchRdvSuivi,
  reportRdv,
  type RdvSuiviItem,
  type RdvSuiviStatus,
} from "./api";
import "./rdvSuivi.css";

type RdvSuiviViewProps = {
  onBack: () => void;
  teamSfUserIds?: string[];
};

const STATUS_LABELS: Record<RdvSuiviStatus, string> = {
  a_venir: "À venir",
  effectue: "Effectué",
  annule: "Annulé",
  no_show: "No-show",
};

const STATUS_COLORS: Record<RdvSuiviStatus, string> = {
  a_venir: "var(--rdv-status-upcoming)",
  effectue: "var(--rdv-status-done)",
  annule: "var(--rdv-status-cancelled)",
  no_show: "var(--rdv-status-noshow)",
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
}

function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-CA"); // YYYY-MM-DD
}

function sectionLabel(key: string, today: string): string {
  if (key === today) return "Aujourd'hui";
  const tomorrow = new Date(new Date(today + "T12:00:00").getTime() + 86400_000)
    .toLocaleDateString("fr-CA");
  if (key === tomorrow) return "Demain";
  return formatDateShort(key + "T12:00:00");
}

export function RdvSuiviView({ onBack, teamSfUserIds }: RdvSuiviViewProps) {
  const { session } = useSession();
  const token = session?.access_token ?? "";

  const [rdvs, setRdvs] = useState<RdvSuiviItem[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [sfWarning, setSfWarning] = useState<string | null>(null);

  // Report form state
  const [formStatus, setFormStatus] = useState<RdvSuiviStatus>("effectue");
  const [formNotes, setFormNotes] = useState("");
  const [formReschedule, setFormReschedule] = useState(false);
  const [formNewStart, setFormNewStart] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchRdvSuivi(token, { teamSfUserIds });
      setRdvs(result.rdvs);
      setPendingCount(result.pending_count);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [token, teamSfUserIds]);

  useEffect(() => { void load(); }, [load]);

  const today = todayParisIso();

  // Group RDVs into sections
  const sections = useMemo(() => {
    const past: RdvSuiviItem[] = [];
    const byDay = new Map<string, RdvSuiviItem[]>();

    for (const rdv of rdvs) {
      const key = dayKey(rdv.start);
      if (key < today) {
        past.push(rdv);
      } else {
        if (!byDay.has(key)) byDay.set(key, []);
        byDay.get(key)!.push(rdv);
      }
    }

    const sortedDays = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));
    return { past, upcoming: sortedDays };
  }, [rdvs, today]);

  const handleExpand = (rdv: RdvSuiviItem) => {
    if (expandedId === rdv.sf_event_id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(rdv.sf_event_id);
    setFormStatus(rdv.status === "a_venir" ? "effectue" : rdv.status);
    setFormNotes(rdv.notes || "");
    setFormReschedule(false);
    setFormNewStart("");
    setSaveError(null);
    setSfWarning(null);
  };

  const handleSubmit = async (rdv: RdvSuiviItem) => {
    if (!token) return;
    setSaving(true);
    setSaveError(null);
    setSfWarning(null);
    try {
      const result = await reportRdv(token, {
        sf_event_id: rdv.sf_event_id,
        status: formStatus,
        notes: formNotes.trim() || undefined,
        ...(formReschedule && formNewStart
          ? { new_start: new Date(formNewStart).toISOString(), duration_min: 60 }
          : {}),
      });
      if (result.sf_sync_failed) {
        setSfWarning("Enregistré localement, mais la synchro Salesforce a échoué.");
      }
      // Update local state
      setRdvs((prev) =>
        prev.map((r) =>
          r.sf_event_id === rdv.sf_event_id
            ? {
                ...r,
                status: formStatus,
                notes: formNotes.trim() || null,
                reported_at: new Date().toISOString(),
              }
            : r,
        ),
      );
      if (!result.sf_sync_failed) {
        setExpandedId(null);
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Erreur d'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="calls-app">
        <WindowBootScreen label="Chargement du suivi RDV…" />
      </div>
    );
  }

  return (
    <div className="rdv-suivi">
      <header className="rdv-suivi__header">
        <Button variant="ghost" size="sm" onClick={onBack}>← Retour</Button>
        <h1 className="rdv-suivi__title">Suivi RDV</h1>
      </header>

      {error && <p className="rdv-suivi__error" role="alert">{error}</p>}

      {pendingCount > 0 && (
        <div className="rdv-suivi__banner" role="status">
          ⚠ {pendingCount} RDV passé{pendingCount > 1 ? "s" : ""} sans compte-rendu
        </div>
      )}

      {/* Past / À renseigner */}
      {sections.past.length > 0 && (
        <section className="rdv-suivi__section">
          <h2 className="rdv-suivi__section-title">À renseigner</h2>
          {sections.past.map((rdv) => (
            <RdvRow
              key={rdv.sf_event_id}
              rdv={rdv}
              expanded={expandedId === rdv.sf_event_id}
              onExpand={() => handleExpand(rdv)}
              formStatus={formStatus}
              formNotes={formNotes}
              formReschedule={formReschedule}
              formNewStart={formNewStart}
              saving={saving}
              saveError={saveError}
              sfWarning={sfWarning}
              onStatusChange={setFormStatus}
              onNotesChange={setFormNotes}
              onRescheduleToggle={setFormReschedule}
              onNewStartChange={setFormNewStart}
              onSubmit={() => void handleSubmit(rdv)}
            />
          ))}
        </section>
      )}

      {/* Upcoming by day */}
      {sections.upcoming.map(([key, items]) => (
        <section key={key} className="rdv-suivi__section">
          <h2 className="rdv-suivi__section-title">{sectionLabel(key, today)}</h2>
          {items.map((rdv) => (
            <RdvRow
              key={rdv.sf_event_id}
              rdv={rdv}
              expanded={expandedId === rdv.sf_event_id}
              onExpand={() => handleExpand(rdv)}
              formStatus={formStatus}
              formNotes={formNotes}
              formReschedule={formReschedule}
              formNewStart={formNewStart}
              saving={saving}
              saveError={saveError}
              sfWarning={sfWarning}
              onStatusChange={setFormStatus}
              onNotesChange={setFormNotes}
              onRescheduleToggle={setFormReschedule}
              onNewStartChange={setFormNewStart}
              onSubmit={() => void handleSubmit(rdv)}
            />
          ))}
        </section>
      ))}

      {!error && rdvs.length === 0 && (
        <p className="rdv-suivi__empty">Aucun RDV sur la période.</p>
      )}
    </div>
  );
}

// ─── Row component ───────────────────────────────────────────────────────────

type RdvRowProps = {
  rdv: RdvSuiviItem;
  expanded: boolean;
  onExpand: () => void;
  formStatus: RdvSuiviStatus;
  formNotes: string;
  formReschedule: boolean;
  formNewStart: string;
  saving: boolean;
  saveError: string | null;
  sfWarning: string | null;
  onStatusChange: (s: RdvSuiviStatus) => void;
  onNotesChange: (v: string) => void;
  onRescheduleToggle: (v: boolean) => void;
  onNewStartChange: (v: string) => void;
  onSubmit: () => void;
};

function RdvRow({
  rdv,
  expanded,
  onExpand,
  formStatus,
  formNotes,
  formReschedule,
  formNewStart,
  saving,
  saveError,
  sfWarning,
  onStatusChange,
  onNotesChange,
  onRescheduleToggle,
  onNewStartChange,
  onSubmit,
}: RdvRowProps) {
  const isPast = dayKey(rdv.start) < todayParisIso();
  const needsAttention = isPast && rdv.status === "a_venir";

  return (
    <div className={`rdv-row ${expanded ? "rdv-row--expanded" : ""} ${needsAttention ? "rdv-row--attention" : ""}`}>
      <button type="button" className="rdv-row__main" onClick={onExpand}>
        <span className="rdv-row__time">{formatTime(rdv.start)}</span>
        <span className="rdv-row__contact">{rdv.contact_name || "—"}</span>
        <span className="rdv-row__account">{rdv.account_name || ""}</span>
        <span className="rdv-row__subject">{rdv.subject}</span>
        {rdv.via_combo && <span className="rdv-row__badge">Combo</span>}
        <span
          className="rdv-row__status"
          style={{ color: STATUS_COLORS[rdv.status] }}
        >
          {STATUS_LABELS[rdv.status]}
        </span>
      </button>

      {expanded && (
        <div className="rdv-row__detail">
          <div className="rdv-row__status-picker">
            {(["effectue", "annule", "no_show"] as RdvSuiviStatus[]).map((s) => (
              <button
                key={s}
                type="button"
                className={`rdv-row__status-btn ${formStatus === s ? "rdv-row__status-btn--active" : ""}`}
                style={{ "--rdv-btn-color": STATUS_COLORS[s] } as React.CSSProperties}
                onClick={() => onStatusChange(s)}
              >
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>

          <textarea
            className="rdv-row__notes"
            placeholder="Compte-rendu du RDV…"
            value={formNotes}
            onChange={(e) => onNotesChange(e.target.value)}
            rows={3}
          />

          <label className="rdv-row__reschedule-toggle">
            <input
              type="checkbox"
              checked={formReschedule}
              onChange={(e) => onRescheduleToggle(e.target.checked)}
            />
            Reporter le RDV
          </label>

          {formReschedule && (
            <input
              type="datetime-local"
              className="rdv-row__new-start"
              value={formNewStart}
              onChange={(e) => onNewStartChange(e.target.value)}
            />
          )}

          {saveError && <p className="rdv-row__error" role="alert">{saveError}</p>}
          {sfWarning && <p className="rdv-row__warning" role="status">{sfWarning}</p>}

          <div className="rdv-row__actions">
            <Button size="sm" onClick={onSubmit} disabled={saving}>
              {saving ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
