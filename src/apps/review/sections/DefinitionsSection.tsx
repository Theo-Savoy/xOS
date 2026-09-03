import { EmptyState, GlassCard, Skeleton } from '../../../components/ui';
import { ScopeTag } from '../components/ScopeTag';
import type { DefinitionsPayload } from '../review.types';

export function DefinitionsSection({
  data,
  loading,
}: {
  data: DefinitionsPayload | null;
  loading: boolean;
}) {
  if (loading && !data) {
    return (
      <div className="review-section">
        <Skeleton height={240} />
      </div>
    );
  }
  if (!data?.items?.length) {
    return (
      <EmptyState
        title="Définitions indisponibles"
        description="Les règles de calcul n'ont pas été chargées."
      />
    );
  }

  return (
    <div className="review-section">
      <header className="review-section-heading">
        <div>
          <h3 className="review-card-title">
            Définitions
          </h3>
          <ScopeTag scope="total" />
          <p className="review-section-kicker">
            Neuf règles métier affichables — source de vérité du bilan
          </p>
        </div>
      </header>
      {data.items.map((item) => (
        <GlassCard key={item.id} className="review-chart-card">
          <h3 className="review-card-title">
            {item.id} · {item.title}
          </h3>
          <p className="review-section-kicker">{item.body}</p>
        </GlassCard>
      ))}
    </div>
  );
}
