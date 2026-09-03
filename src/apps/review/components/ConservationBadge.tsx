import { Tag } from '../../../components/ui';
import type { Conservation } from '../review.types';

export function ConservationBadge({
  conservation,
}: {
  conservation: Conservation | null | undefined;
}) {
  if (!conservation) return null;
  if (conservation.ok) {
    return (
      <Tag variant="success" className="review-conservation">
        Conservation OK
      </Tag>
    );
  }
  return (
    <Tag variant="alert" className="review-conservation">
      Écart conservation · {conservation.delta_count} ·{' '}
      {conservation.delta_amount.toFixed(0)} €
    </Tag>
  );
}
