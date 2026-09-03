import { EmptyState, Skeleton } from '../../../components/ui';
import { FactorMatrix } from '../components/FactorMatrix';
import { InfoHint } from '../components/InfoHint';
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
            Matrice de diagnostic : mesure et attribution{' '}
            <ScopeTag scope="total" />{' '}
            <InfoHint
              label="Limite d’attribution"
              text={data.attribution_limit}
            />
          </h3>
          <p className="review-section-kicker">
            Impact, fiabilité de mesure, fiabilité d&apos;attribution, données
            manquantes
          </p>
        </div>
      </header>
      <FactorMatrix factors={data.factors} />
    </div>
  );
}
