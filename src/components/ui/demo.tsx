import { useState } from "react";
import logoXos from "../../assets/logo-xos.png";
import "../../os/theme.css";
import { Button } from "./Button";
import { DatePicker } from "./DatePicker";
import { EmptyState } from "./EmptyState";
import { GlassCard } from "./GlassCard";
import { Modal } from "./Modal";
import { ProgressBar } from "./ProgressBar";
import { SegmentedControl } from "./SegmentedControl";
import { Skeleton } from "./Skeleton";
import { Tag } from "./Tag";

/** Page de démo des composants UI X OS, enregistrée comme app en dev. */
export function UiDemo() {
  const [modalOpen, setModalOpen] = useState(false);
  const [glassModalOpen, setGlassModalOpen] = useState(false);
  const [demoDate, setDemoDate] = useState("");
  const [demoSegments, setDemoSegments] = useState<string[]>(["rdv"]);

  return (
    <div style={{ minHeight: "100%", padding: "3rem" }}>

      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "2.5rem",
        }}
      >
        <span className="xos-logo">
          <img
            src={logoXos}
            alt="XOS"
            className="xos-logo__img"
            width={880}
            height={334}
          />
        </span>
        <span className="xos-numeric" style={{ color: "var(--xos-text-muted)" }}>
          1 234,56 €
        </span>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: "1.5rem",
        }}
      >
        <GlassCard>
          <h2 style={{ fontFamily: "var(--xos-font-display)", margin: "0 0 1rem" }}>
            Boutons — variants
          </h2>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
            <Button variant="primary">Primaire</Button>
            <Button variant="secondary">Secondaire</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
            <Button variant="icon" aria-label="Icône">★</Button>
            <Button variant="primary" disabled>
              Désactivé
            </Button>
          </div>
        </GlassCard>

        <GlassCard>
          <h2 style={{ fontFamily: "var(--xos-font-display)", margin: "0 0 1rem" }}>
            Boutons — tailles
          </h2>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg">Large</Button>
          </div>
        </GlassCard>

        <GlassCard>
          <h2 style={{ fontFamily: "var(--xos-font-display)", margin: "0 0 1rem" }}>
            Modal
          </h2>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <Button variant="secondary" onClick={() => setModalOpen(true)}>
              Ouvrir (défaut)
            </Button>
            <Button variant="secondary" onClick={() => setGlassModalOpen(true)}>
              Ouvrir (glass)
            </Button>
          </div>
          <Modal
            open={modalOpen}
            title="Modal par défaut"
            onClose={() => setModalOpen(false)}
            primaryAction={{ label: "Valider", onClick: () => setModalOpen(false) }}
            secondaryAction={{ label: "Annuler", onClick: () => setModalOpen(false) }}
          >
            Contenu de la modal.
          </Modal>
          <Modal
            open={glassModalOpen}
            title="Modal glass"
            variant="glass"
            onClose={() => setGlassModalOpen(false)}
            primaryAction={{ label: "Valider", onClick: () => setGlassModalOpen(false) }}
          >
            Variante plein écran, glass appuyé — absorbe l&apos;ancien useComboOverlay.
          </Modal>
        </GlassCard>

        <GlassCard>
          <h2 style={{ fontFamily: "var(--xos-font-display)", margin: "0 0 1rem" }}>
            Tags
          </h2>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <Tag>Défaut</Tag>
            <Tag variant="accent">Accent</Tag>
            <Tag variant="alert">Alerte</Tag>
          </div>
        </GlassCard>

        <GlassCard>
          <h2 style={{ fontFamily: "var(--xos-font-display)", margin: "0 0 1rem" }}>
            ProgressBar
          </h2>
          <ProgressBar called={7} total={12} />
        </GlassCard>

        <GlassCard>
          <h2 style={{ fontFamily: "var(--xos-font-display)", margin: "0 0 1rem" }}>
            Skeleton
          </h2>
          <div style={{ display: "grid", gap: "0.5rem" }}>
            <Skeleton height="1.2rem" width="70%" />
            <Skeleton height="1.2rem" width="90%" />
            <Skeleton height="1.2rem" width="50%" />
          </div>
        </GlassCard>

        <GlassCard>
          <h2 style={{ fontFamily: "var(--xos-font-display)", margin: "0 0 1rem" }}>
            SegmentedControl
          </h2>
          <SegmentedControl
            label="Filtrer"
            options={[
              { value: "rdv", label: "RDV" },
              { value: "argumente", label: "Argumenté" },
              { value: "npa", label: "NPA" },
            ]}
            value={demoSegments}
            onChange={setDemoSegments}
          />
        </GlassCard>

        <GlassCard>
          <h2 style={{ fontFamily: "var(--xos-font-display)", margin: "0 0 1rem" }}>
            DatePicker
          </h2>
          <DatePicker label="Date" value={demoDate} onChange={setDemoDate} />
        </GlassCard>

        <GlassCard>
          <h2 style={{ fontFamily: "var(--xos-font-display)", margin: "0 0 1rem" }}>
            EmptyState
          </h2>
          <EmptyState title="Aucun résultat" description="Ajustez vos filtres pour voir des données." />
        </GlassCard>

        <GlassCard>
          <h2 style={{ fontFamily: "var(--xos-font-display)", margin: "0 0 0.5rem" }}>
            Typographie
          </h2>
          <p style={{ fontFamily: "var(--xos-font-display)", margin: "0 0 0.5rem" }}>
            Brockmann — titres et texte (Regular / Medium / SemiBold / Bold)
          </p>
          <p className="xos-numeric" style={{ fontSize: "1.5rem", margin: 0 }}>
            0123456789 — Neue Montreal
          </p>
        </GlassCard>
      </div>
    </div>
  );
}

export default UiDemo;
