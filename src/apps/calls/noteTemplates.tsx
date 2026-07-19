import type { ResultatCall } from "../../crm";
import { appendNoteChip } from "./formControls.helpers";

export type MeddicCategory =
  | "interet_produit"
  | "maturite"
  | "douleur"
  | "metrique"
  | "champion"
  | "decideur"
  | "concurrence"
  | "budget"
  | "timing"
  | "engagement";

export type ChipOption = { label: string; value: string };

/** Framework MEDDIC lite : options terrain par catégorie, pour tagger vite une note d'appel. */
export const MEDDIC_CHIPS: Record<MeddicCategory, readonly ChipOption[]> = {
  interet_produit: [
    { label: "Intérêt produit A", value: "Intérêt produit A" },
    { label: "Intérêt produit B", value: "Intérêt produit B" },
    { label: "Intérêt produit C", value: "Intérêt produit C" },
    { label: "Pas d'intérêt produit", value: "Pas d'intérêt produit" },
    { label: "Intérêt produit mais pas prioritaire", value: "Intérêt produit mais pas prioritaire" },
  ],
  maturite: [
    { label: "Curieux", value: "Curieux" },
    { label: "Évalue", value: "Évalue" },
    { label: "Compare à la concurrence", value: "Compare à la concurrence" },
    { label: "Décision imminente", value: "Décision imminente" },
    { label: "Pas de projet", value: "Pas de projet" },
    { label: "Projet reporté", value: "Projet reporté" },
  ],
  douleur: [
    { label: "Douleur identifiée", value: "Douleur identifiée" },
    { label: "Douleur floue", value: "Douleur floue" },
    { label: "Pas de douleur exprimée", value: "Pas de douleur exprimée" },
    { label: "Douleur budget", value: "Douleur budget" },
    { label: "Douleur conformité", value: "Douleur conformité" },
    { label: "Douleur formation équipe", value: "Douleur formation équipe" },
  ],
  metrique: [
    { label: "Métrique identifiée", value: "Métrique identifiée" },
    { label: "ROI calculé", value: "ROI calculé" },
    { label: "ROI flou", value: "ROI flou" },
    { label: "Pas de métrique", value: "Pas de métrique" },
    { label: "Métrique satisfaction", value: "Métrique satisfaction" },
    { label: "Métrique rétention", value: "Métrique rétention" },
  ],
  champion: [
    { label: "Champion identifié", value: "Champion identifié" },
    { label: "Champion exécutif", value: "Champion exécutif" },
    { label: "Champion opérationnel", value: "Champion opérationnel" },
    { label: "Pas de champion", value: "Pas de champion" },
    { label: "Champion à identifier", value: "Champion à identifier" },
  ],
  decideur: [
    { label: "Décideur connu", value: "Décideur connu" },
    { label: "Décideur économique", value: "Décideur économique" },
    { label: "Décideur technique", value: "Décideur technique" },
    { label: "Pas de décideur identifié", value: "Pas de décideur identifié" },
    { label: "Comité de décision", value: "Comité de décision" },
    { label: "Décision à plusieurs", value: "Décision à plusieurs" },
  ],
  concurrence: [
    { label: "En concurrence", value: "En concurrence" },
    { label: "Concurrent identifié", value: "Concurrent identifié" },
    { label: "Pas de concurrence", value: "Pas de concurrence" },
    { label: "Notre solution déjà en place", value: "Notre solution déjà en place" },
    { label: "Renouvellement en cours", value: "Renouvellement en cours" },
  ],
  budget: [
    { label: "Budget validé", value: "Budget validé" },
    { label: "Budget en attente", value: "Budget en attente" },
    { label: "Budget flou", value: "Budget flou" },
    { label: "Pas de budget", value: "Pas de budget" },
    { label: "Budget validé pour tel mois", value: "Budget validé pour tel mois" },
    { label: "Budget annuel validé", value: "Budget annuel validé" },
    { label: "Contrat expire telle date", value: "Contrat expire telle date" },
  ],
  timing: [
    { label: "Décision ce trimestre", value: "Décision ce trimestre" },
    { label: "Décision Q+1", value: "Décision Q+1" },
    { label: "Décision Q+2", value: "Décision Q+2" },
    { label: "Décision ce mois", value: "Décision ce mois" },
    { label: "Pas de timing défini", value: "Pas de timing défini" },
    { label: "Décision reportée", value: "Décision reportée" },
  ],
  engagement: [
    { label: "Premier contact", value: "Premier contact" },
    { label: "Engagement à approfondir", value: "Engagement à approfondir" },
    { label: "Engagement tiède", value: "Engagement tiède" },
    { label: "Engagement fort", value: "Engagement fort" },
    { label: "Désengagement", value: "Désengagement" },
    { label: "À recontacter plus tard", value: "À recontacter plus tard" },
  ],
};

const CATEGORY_LABELS: Record<MeddicCategory, string> = {
  interet_produit: "Intérêt produit",
  maturite: "Maturité du projet",
  douleur: "Douleur",
  metrique: "Métrique / ROI",
  champion: "Champion",
  decideur: "Décideur",
  concurrence: "Concurrence",
  budget: "Budget",
  timing: "Timing",
  engagement: "Engagement",
};

/** Catégories MEDDIC pertinentes selon le résultat de l'appel. */
export const RESULTAT_TO_MEDDIC_CATEGORIES: Record<ResultatCall, readonly MeddicCategory[]> = {
  "Appel non décroché": ["timing"],
  "Message répondeur": ["timing"],
  "Appel décroché": ["douleur", "maturite", "concurrence"],
  "Appel argumenté": ["douleur", "metrique", "champion", "concurrence", "engagement"],
  "RDV planifié": ["douleur", "metrique", "champion", "decideur", "budget", "timing", "engagement"],
};

export { appendNoteChip };

/** N'apparaît que si le commentaire est vide — pas de wizard, pas de popover. */
export function NoteTemplateChips({
  value,
  onChange,
  resultat,
}: {
  value: string;
  onChange: (next: string) => void;
  resultat: ResultatCall;
}) {
  if (value.trim().length > 0) return null;
  const categories = RESULTAT_TO_MEDDIC_CATEGORIES[resultat] ?? [];
  if (categories.length === 0) return null;

  return (
    <div className="calls-medic-chips" role="group" aria-label="Modèles de note MEDDIC">
      {categories.map((category) => (
        <div key={category} className="calls-medic-category">
          <span className="calls-medic-category__label">{CATEGORY_LABELS[category]}</span>
          <div className="calls-chip-row calls-medic-category__chips">
            {MEDDIC_CHIPS[category].map((opt) => (
              <button
                key={opt.value}
                type="button"
                className="calls-chip calls-chip--meddic"
                onClick={() => onChange(appendNoteChip(value, opt.value))}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
