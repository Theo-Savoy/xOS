import type { ReactNode } from 'react';
import { GlassCard, Tag } from '../../../components/ui';
import type { ScopeKind } from '../review.types';
export function StatCard({
  label,
  value,
  hint,
  delta,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  scope?: ScopeKind;
  delta?: string | null;
}) {
  return (
    <GlassCard className="review-kpi-card">
      <span className="review-kpi-label">{label}</span>
      <span className="review-kpi-value">{value}</span>
      {hint ? <span className="review-kpi-sub">{hint}</span> : null}
      {delta ? <Tag variant="muted">{delta}</Tag> : null}
    </GlassCard>
  );
}
