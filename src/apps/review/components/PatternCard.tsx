import { GlassCard } from '../../../components/ui';
import type { SynthesisPattern } from '../review.types';

export function PatternCard({ pattern }: { pattern: SynthesisPattern }) {
  return (
    <GlassCard className="review-chart-card review-pattern-card">
      <h3 className="review-card-title">{pattern.title}</h3>
      <p className="review-section-kicker">{pattern.body}</p>
    </GlassCard>
  );
}
