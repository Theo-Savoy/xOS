import { useMemo, useState } from "react";
import { Button, GlassCard, Tag } from "../../components/ui";
import { ConfirmDialog } from "./ConfirmDialog";
import { DatePicker, formatIsoDateFr, todayParisIso } from "./formControls";
import { sessionDayKey } from "./sessionLifecycle";
import type { SessionContact, SessionDetail } from "./types";

export type RolloverDecision = {
  contactId: number;
  action: "contact" | "remove";
  scheduledFor: string | null;
};

type RolloverDecisionViewProps = {
  session: SessionDetail;
  contacts: SessionContact[];
  loading?: boolean;
  error?: string | null;
  onApply: (decisions: RolloverDecision[]) => Promise<void>;
};

export function RolloverDecisionView({
  session,
  contacts,
  loading = false,
  error = null,
  onApply,
}: RolloverDecisionViewProps) {
  const pending = useMemo(() => contacts.filter((contact) => contact.status === "pending"), [contacts]);
  const [globalAction, setGlobalAction] = useState<RolloverDecision["action"]>("contact");
  const [overrides, setOverrides] = useState<Record<number, RolloverDecision["action"]>>({});
  const [dates, setDates] = useState<Record<number, string>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);

  const decisions = pending.map((contact) => ({
    contactId: contact.id,
    action: overrides[contact.id] ?? globalAction,
    scheduledFor: (overrides[contact.id] ?? globalAction) === "contact"
      ? dates[contact.id] ?? todayParisIso()
      : null,
  }));
  const removeCount = decisions.filter((decision) => decision.action === "remove").length;

  const apply = () => {
    if (removeCount > 0) {
      setConfirmOpen(true);
      return;
    }
    void onApply(decisions);
  };

  return (
    <div className="calls-view calls-rollover" aria-labelledby="calls-rollover-title">
      <header className="calls-view__header">
        <div>
          <Tag variant="warning">Séance à clôturer</Tag>
          <h2 id="calls-rollover-title">Décider du devenir des contacts</h2>
          <p className="calls-muted">
            {session.name} est datée du {formatIsoDateFr(sessionDayKey(session))}.
            {" "}La séance est fermée, mais les {pending.length} contact{pending.length > 1 ? "s" : ""} en attente restent disponibles.
          </p>
        </div>
      </header>

      {error && <p className="calls-state" role="alert">{error}</p>}

      <GlassCard className="calls-rollover__panel">
        <div className="calls-rollover__global" role="group" aria-label="Décision globale">
          <span>Pour tous les contacts</span>
          <Button
            variant={globalAction === "contact" ? "primary" : "secondary"}
            aria-pressed={globalAction === "contact"}
            onClick={() => setGlobalAction("contact")}
          >
            Contacter
          </Button>
          <Button
            variant={globalAction === "remove" ? "primary" : "secondary"}
            aria-pressed={globalAction === "remove"}
            onClick={() => setGlobalAction("remove")}
          >
            Retirer
          </Button>
        </div>

        <ul className="calls-rollover__contacts">
          {pending.map((contact) => {
            const action = overrides[contact.id] ?? globalAction;
            const date = dates[contact.id] ?? todayParisIso();
            return (
              <li key={contact.id} className="calls-rollover__contact">
                <div>
                  <strong>{contact.contact_name}</strong>
                  {contact.account_name && <small>{contact.account_name}</small>}
                </div>
                <label>
                  <span>Décision</span>
                  <select
                    aria-label={"Décision pour " + contact.contact_name}
                    value={action}
                    onChange={(event) =>
                      setOverrides((current) => ({
                        ...current,
                        [contact.id]: event.target.value as RolloverDecision["action"],
                      }))
                    }
                  >
                    <option value="contact">Contacter</option>
                    <option value="remove">Retirer</option>
                  </select>
                </label>
                {action === "contact" && (
                  <DatePicker
                    label={"Date pour " + contact.contact_name}
                    value={date}
                    onChange={(next) => setDates((current) => ({ ...current, [contact.id]: next }))}
                  />
                )}
              </li>
            );
          })}
        </ul>

        <div className="calls-runner-actions">
          <Button onClick={apply} disabled={loading || pending.length === 0}>
            {loading ? "Enregistrement…" : "Appliquer les décisions"}
          </Button>
        </div>
      </GlassCard>

      <ConfirmDialog
        open={confirmOpen}
        title="Confirmer le retrait"
        description={"Retirer " + removeCount + " contact" + (removeCount > 1 ? "s" : "") + " de la séance ? L'historique d'appel est conservé."}
        confirmLabel={removeCount === 1 ? "Retirer le contact" : "Retirer les " + removeCount + " contacts"}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          void onApply(decisions);
        }}
        loading={loading}
      />
    </div>
  );
}
