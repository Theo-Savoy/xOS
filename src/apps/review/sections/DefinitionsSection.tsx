import { EmptyState, GlassCard, Skeleton } from '../../../components/ui';
import { ConservationBadge } from '../components/ConservationBadge';
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
        title="Contrats de calcul indisponibles"
        description="Les contrats de calcul n'ont pas été chargés."
      />
    );
  }

  return (
    <div className="review-section">
      <header className="review-section-heading">
        <div>
          <h3 className="review-card-title">
            Contrats de calcul <ScopeTag scope="total" />
          </h3>
          <p className="review-section-kicker">
            Neuf règles métier affichables — source de vérité du bilan
          </p>
        </div>
        <ConservationBadge conservation={data.conservation} />
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
