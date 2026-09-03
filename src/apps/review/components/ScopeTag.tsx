import type { ScopeKind } from '../review.types';

const SCOPE_LABELS: Record<ScopeKind, string> = {
  total: 'CA total',
  new: 'CA NEW',
  'signatures-new': 'Signatures NEW',
};

export function ScopeTag({
  scope,
  className,
}: {
  scope: ScopeKind;
  className?: string;
}) {
  return (
    <p className={`review-section-scope${className ? ` ${className}` : ''}`}>
      {SCOPE_LABELS[scope]}
    </p>
  );
}
