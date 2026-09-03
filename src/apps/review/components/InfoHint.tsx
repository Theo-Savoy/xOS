import { Button } from '../../../components/ui';

/**
 * Icône « i » : sort le contexte éditorial du flux tout en le gardant accessible.
 * Emplacement futur du commentaire / de l'analyse de section (payload `analysis`).
 * Tant que `analysis.status === 'none'`, aucun contenu d'analyse n'est affiché.
 */
export function InfoHint({ label, text }: { label: string; text: string }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="review-hint"
      aria-label={label}
    >
      i
      <span className="review-hint__bubble" role="tooltip">
        {text}
      </span>
    </Button>
  );
}
