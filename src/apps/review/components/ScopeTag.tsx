import { Tag } from '../../../components/ui';
import type { ScopeKind } from '../review.types';

const LABELS: Record<ScopeKind, string> = {
  total: 'CA total',
  new: 'CA NEW',
  'signatures-new': 'Signatures NEW',
};

const VARIANTS: Record<ScopeKind, 'accent' | 'default' | 'muted'> = {
  total: 'default',
  new: 'accent',
  'signatures-new': 'muted',
};

export function ScopeTag({ scope }: { scope: ScopeKind }) {
  return (
    <Tag variant={VARIANTS[scope]} className="review-scope-tag">
      {LABELS[scope]}
    </Tag>
  );
}
