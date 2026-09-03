import { Button } from '../../../components/ui';

/** Icône « i » : sort le contexte éditorial du flux tout en le gardant accessible. */
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
