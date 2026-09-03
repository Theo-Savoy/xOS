import { EmptyState, GlassCard, Skeleton } from '../../../components/ui';
import { ScopeTag } from '../components/ScopeTag';
import { fmtPct1 } from '../review.helpers';
import type { MarketPayload, ReasonTable } from '../review.types';

function ReasonList({
  table,
  emptyLabel = 'Aucun motif déclaré (n=0)',
}: {
  table: ReasonTable | undefined;
  emptyLabel?: string;
}) {
  if (!table || table.n_total === 0 || !table.items.length) {
    return <p className="review-reasons-empty">{emptyLabel}</p>;
  }
  const max = Math.max(...table.items.map((row) => row.pct), 1);
  return (
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
  );
}

function ProductReasonsCard({
  title,
  winTable,
  lossTable,
  emptyWin = 'Aucun motif déclaré (n=0)',
}: {
  title: string;
  winTable: ReasonTable | undefined;
  lossTable: ReasonTable | undefined;
  emptyWin?: string;
}) {
  return (
    <GlassCard className="review-chart-card">
      <h3 className="review-card-title">{title}</h3>
      <div className="review-reasons-group">
        <h4 className="review-reasons-subheading">
          Gains · n={winTable?.n_total ?? 0}
        </h4>
        <ReasonList table={winTable} emptyLabel={emptyWin} />
      </div>
      <div className="review-reasons-group" style={{ marginTop: 'var(--xos-space-4)' }}>
        <h4 className="review-reasons-subheading">
          Pertes · n={lossTable?.n_total ?? 0}
        </h4>
        <ReasonList table={lossTable} />
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
        title="Aucun motif sur la période"
        description="Aucun motif de gain ou de perte sur cette fenêtre."
      />
    );
  }

  return (
    <div className="review-section">
      <header className="review-section-heading">
        <div>
          <h3 className="review-card-title">Gain / perte par produit</h3>
          <ScopeTag scope="signatures-new" />
        </div>
      </header>

      <div className="review-compare-grid">
        <ProductReasonsCard
          title="Catalogue"
          winTable={data.win_by_offer.catalogue}
          lossTable={data.loss_by_offer?.catalogue}
        />
        <ProductReasonsCard
          title="Sur-mesure"
          winTable={data.win_by_offer.sur_mesure}
          lossTable={data.loss_by_offer?.sur_mesure}
        />
        <ProductReasonsCard
          title="Conseil"
          winTable={data.win_by_offer.conseil}
          lossTable={data.loss_by_offer?.conseil}
          emptyWin="Pas de ventes Conseil"
        />
      </div>
    </div>
  );
}
