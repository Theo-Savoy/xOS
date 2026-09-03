import { EmptyState, GlassCard, Skeleton } from '../../../components/ui';
import { PatternCard } from '../components/PatternCard';
import { ScopeTag } from '../components/ScopeTag';
import type { SynthesisPayload } from '../review.types';

export function PatternsSection({
  data,
  loading,
}: {
  data: SynthesisPayload | null;
  loading: boolean;
}) {
  if (loading && !data) {
    return (
      <div className="review-section">
        <Skeleton height={200} />
      </div>
    );
  }
  if (!data?.patterns?.length) {
    return (
      <EmptyState
        title="Pas encore de conclusion"
        description="La synthèse de la période n'a pas encore de conclusions."
      />
    );
  }

  return (
    <div className="review-section">
      <header className="review-section-heading">
        <div>
          <h3 className="review-card-title">
            Lecture
          </h3>
          <ScopeTag scope="total" />
        </div>
      </header>
      <div className="review-patterns-grid">
        {data.patterns.map((pattern) => (
          <PatternCard key={pattern.id} pattern={pattern} />
        ))}
      </div>
      <GlassCard className="review-chart-card">
        <h3 className="review-card-title">Verdict</h3>
        <p className="review-section-kicker">{data.verdict}</p>
      </GlassCard>
    </div>
  );
}
