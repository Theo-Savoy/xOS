import { useEffect, useState } from "react";
import { Button, GlassCard, Tag } from "../../components/ui";
import type { ResultatCall } from "../../crm";
import { EventPanel } from "./EventPanel";
import { ProgressBar } from "./ProgressBar";
import type { SessionContact, SessionDetail } from "./types";
import { RESULTAT_OPTIONS } from "./types";

type RunnerViewProps = {
  session: SessionDetail;
  contacts: SessionContact[];
  currentContact: SessionContact | null;
  loading: boolean;
  error: string | null;
  awaitingEvent: boolean;
  onBack: () => void;
  onLogAndNext: (resultat: ResultatCall, comments: string, durationSec: number | null) => void;
  onLogEvent: (start: string, durationMin: number, invitees: string[]) => void;
  onSkip: () => void;
};

export function RunnerView({
  session,
  contacts,
  currentContact,
  loading,
  error,
  awaitingEvent,
  onBack,
  onLogAndNext,
  onLogEvent,
  onSkip,
}: RunnerViewProps) {
  const [resultat, setResultat] = useState<ResultatCall>(RESULTAT_OPTIONS[0].value);
  const [comments, setComments] = useState("");
  const [duration, setDuration] = useState("");

  useEffect(() => {
    setResultat(RESULTAT_OPTIONS[0].value);
    setComments("");
    setDuration("");
  }, [currentContact?.id]);

  const called = contacts.filter((c) => c.status === "called").length;
  const total = contacts.length;

  return (
    <div className="calls-view calls-view--runner">
      <header className="calls-view__header">
        <div>
          <Tag variant="accent">En cours</Tag>
          <h2>{session.name}</h2>
        </div>
        <Button variant="secondary" onClick={onBack}>
          Quitter
        </Button>
      </header>

      <ProgressBar called={called} total={total} label="Progression de la séance" />

      {error && (
        <GlassCard className="calls-error">
          <p>{error}</p>
        </GlassCard>
      )}

      {currentContact ? (
        <>
          <GlassCard className="calls-contact-card">
            <h3>{currentContact.contact_name}</h3>
            <p className="calls-contact-card__account">
              {currentContact.account_name ?? "Compte inconnu"}
            </p>
            {currentContact.phone ? (
              <div className="calls-contact-card__phone">
                <a href={`tel:${currentContact.phone}`} className="calls-phone-link xos-numeric">
                  {currentContact.phone}
                </a>
                <Button
                  variant="secondary"
                  onClick={() => window.open(`tel:${currentContact.phone}`, "_self")}
                >
                  Appeler
                </Button>
              </div>
            ) : (
              <p className="calls-contact-card__no-phone">Aucun numéro</p>
            )}
          </GlassCard>

          {awaitingEvent ? (
            <EventPanel
              contactName={currentContact.contact_name}
              loading={loading}
              onSubmit={onLogEvent}
            />
          ) : (
            <GlassCard className="calls-log-form">
              <h3>Journaliser l&apos;appel</h3>
              <label className="calls-field">
                <span>Résultat</span>
                <select
                  className="calls-select"
                  value={resultat}
                  onChange={(e) => setResultat(e.target.value as ResultatCall)}
                >
                  {RESULTAT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="calls-fb-row">
                <label className="calls-field">
                  <span>Durée (secondes)</span>
                  <input
                    type="number"
                    min={0}
                    className="calls-input"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    placeholder="120"
                  />
                </label>
              </div>
              <label className="calls-field">
                <span>Commentaires</span>
                <textarea
                  className="calls-textarea"
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  rows={3}
                  placeholder="Notes sur l'appel…"
                />
              </label>
              <div className="calls-runner-actions">
                <Button
                  onClick={() =>
                    onLogAndNext(resultat, comments, duration ? Number(duration) : null)
                  }
                  disabled={loading}
                >
                  {loading ? "Enregistrement…" : "Logguer & suivant"}
                </Button>
                <Button variant="secondary" onClick={onSkip} disabled={loading}>
                  Passer
                </Button>
              </div>
            </GlassCard>
          )}
        </>
      ) : (
        <GlassCard className="calls-empty">
          <p>Tous les contacts ont été traités.</p>
        </GlassCard>
      )}
    </div>
  );
}
