import { EmptyState, GlassCard, Skeleton } from '../../../components/ui';
import { InfoHint } from '../components/InfoHint';
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
        title="Aucun pattern"
        description="La synthèse n'a pas encore de conclusion."
      />
    );
  }

  return (
    <div className="review-section">
      <header className="review-section-heading">
        <div>
          <h3 className="review-card-title">
            Lectures structurantes de l&apos;exercice <ScopeTag scope="total" />{' '}
            <InfoHint label="Point clé de la synthèse" text={data.key_point} />
          </h3>
          <p className="review-section-kicker">
            Patterns retenus, puis verdict d&apos;ensemble
          </p>
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
