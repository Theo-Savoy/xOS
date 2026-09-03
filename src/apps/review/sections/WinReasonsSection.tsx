import { EmptyState, GlassCard, Skeleton } from '../../../components/ui';
import { ScopeTag } from '../components/ScopeTag';
import { fmtPct1 } from '../review.helpers';
import type { MarketPayload, ReasonTable } from '../review.types';

function ReasonBars({
  title,
  table,
}: {
  title: string;
  table: ReasonTable | undefined;
}) {
  if (!table) return null;
  const max = Math.max(...table.items.map((row) => row.pct), 1);
  return (
    <GlassCard className="review-chart-card">
      <h3 className="review-card-title">{title}</h3>
      <p className="review-section-kicker">
        n={table.n_total} · {table.n_displayed} motifs affichés
      </p>
      <div className="review-reason-bars">
        {table.items.map((row) => (
          <div key={row.label} className="review-reason-row">
            <span className="review-reason-label" title={row.label}>
              {row.label}
            </span>
            <div className="review-funnel-bar-track">
              <div
                className="review-funnel-bar"
                style={{ width: `${(row.pct / max) * 100}%` }}
              />
            </div>
            <span className="review-reason-pct">
              {fmtPct1(row.pct / 100)}
              <span className="review-reason-count"> {row.count}</span>
            </span>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

export function WinReasonsSection({
  data,
  loading,
}: {
  data: MarketPayload | null;
  loading: boolean;
}) {
  if (loading && !data) {
    return (
      <div className="review-section">
        <Skeleton height={120} />
        <Skeleton height={280} />
      </div>
    );
  }
  if (!data?.win_by_offer) {
    return (
      <EmptyState
        title="Aucun motif de gain"
        description="Pas de raisons de gain NEW sur cette fenêtre."
      />
    );
  }

  return (
    <div className="review-section">
      <header className="review-section-heading">
        <div>
          <h3 className="review-card-title">
            Motifs de gain déclarés par offre{' '}
            <ScopeTag scope="signatures-new" />
          </h3>
          <p className="review-section-kicker">
            Signatures NEW · motifs déclarés, pas de causalité · {data.fy}
          </p>
        </div>
      </header>

      <div className="review-compare-grid">
        <ReasonBars
          title={`Catalogue · n=${data.win_by_offer.catalogue.n_total}`}
          table={data.win_by_offer.catalogue}
        />
        <ReasonBars
          title={`Sur-mesure · n=${data.win_by_offer.sur_mesure.n_total}`}
          table={data.win_by_offer.sur_mesure}
        />
      </div>
    </div>
  );
}
