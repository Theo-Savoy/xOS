import { EmptyState, Skeleton } from '../../../components/ui';
import { ConservationBadge } from '../components/ConservationBadge';
import { FactorMatrix } from '../components/FactorMatrix';
import { ScopeTag } from '../components/ScopeTag';
import type { DiagnosisPayload } from '../review.types';

export function DiagnosisSection({
  data,
  loading,
}: {
  data: DiagnosisPayload | null;
  loading: boolean;
}) {
  if (loading && !data) {
    return (
      <div className="review-section">
        <Skeleton height={280} />
      </div>
    );
  }
  if (!data?.factors?.length) {
    return (
      <EmptyState
        title="Aucun diagnostic"
        description="La matrice de facteurs n'a pas encore de données."
      />
    );
  }

  return (
    <div className="review-section">
      <header className="review-section-heading">
        <div>
          <h3 className="review-card-title">
            Ce qu&apos;on sait mesurer, et ce qu&apos;on ne peut pas attribuer{' '}
            <ScopeTag scope="total" />
          </h3>
          <p className="review-section-kicker">{data.attribution_limit}</p>
        </div>
        <ConservationBadge conservation={data.conservation} />
      </header>
      <FactorMatrix factors={data.factors} />
    </div>
  );
}
