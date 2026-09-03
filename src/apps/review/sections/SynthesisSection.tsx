import { EmptyState, Skeleton } from '../../../components/ui';
import { InfoHint } from '../components/InfoHint';
import { ScopeTag } from '../components/ScopeTag';
import { StatCard } from '../components/StatCard';
import type { SynthesisPayload } from '../review.types';

export function SynthesisSection({
  data,
  loading,
}: {
  data: SynthesisPayload | null;
  loading: boolean;
}) {
  if (loading && !data) {
    return (
      <div className="review-section">
        <Skeleton height={120} />
      </div>
    );
  }
  if (!data?.cards?.length) {
    return (
      <EmptyState
        title="Aucune synthèse"
        description="Les 4 cartes de l'exercice n'ont pas encore de données."
      />
    );
  }

  return (
    <div className="review-section">
      <header className="review-section-heading">
        <div>
          <h3 className="review-card-title">
            Cadrage de l&apos;exercice <ScopeTag scope="total" />{' '}
            <InfoHint label="Point clé du cadrage" text={data.key_point} />
          </h3>
          <p className="review-section-kicker">
            Quatre indicateurs : performance, offres, capacité, marché
          </p>
        </div>
      </header>
      <div className="review-kpi-grid review-kpi-grid--quad">
        {data.cards.map((card) => (
          <StatCard
            key={card.key}
            label={card.label}
            value={card.display}
            scope={card.scope}
            hint={card.hint}
          />
        ))}
      </div>
    </div>
  );
}
