import { EmptyState, GlassCard, Skeleton } from '../../../components/ui';
import { ScopeTag } from '../components/ScopeTag';
import { StatCard } from '../components/StatCard';
import type { QualityPayload } from '../review.types';

export function QualitySection({
  data,
  loading,
}: {
  data: QualityPayload | null;
  loading: boolean;
}) {
  if (loading && !data) {
    return (
      <div className="review-section">
        <Skeleton height={200} />
      </div>
    );
  }
  if (!data) {
    return (
      <EmptyState
        title="Qualité indisponible"
        description="Les compteurs qualité n'ont pas été chargés."
      />
    );
  }

  return (
    <div className="review-section">
      <header className="review-section-heading">
        <div>
          <h3 className="review-card-title">
            Qualité des données <ScopeTag scope="total" />
          </h3>
          <p className="review-section-kicker">
            Compteurs live · le snapshot du 21/07/2026 n&apos;est pas une cible
            à figer
          </p>
        </div>
      </header>

      <div className="review-kpi-grid">
        <StatCard
          label="Écart de tag FY"
          value={String(data.tag_mismatch)}
          hint="_fy_created / _fy_closed recalculés"
        />
        <StatCard
          label="Cycles négatifs"
          value={String(data.negative_cycles)}
          hint={`${data.n_valid} exploitables / ${data.n_won_new} signatures NEW`}
        />
        <StatCard
          label="Cycles > 365 j"
          value={String(data.over_365)}
          hint={`dont ${data.over_730} > 730 j`}
        />
        <StatCard
          label="Montant manquant"
          value={String(data.missing_amount)}
          hint={`${data.won_total} opportunités gagnées`}
        />
      </div>

      <GlassCard className="review-chart-card">
        <h3 className="review-card-title">Volumétrie export</h3>
        <p className="review-section-kicker">
          {data.created_rows} lignes CreatedDate · {data.closed_rows} lignes
          CloseDate sur la fenêtre chargée
        </p>
        <ul className="review-study-points">
          {data.limits.map((limit) => (
            <li key={limit} className="review-study-point">
              {limit}
            </li>
          ))}
        </ul>
      </GlassCard>
    </div>
  );
}
