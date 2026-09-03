import { EmptyState, GlassCard, Skeleton } from '../../../components/ui';
import { ScopeTag } from '../components/ScopeTag';
import { StatCard } from '../components/StatCard';
import { fmtEur } from '../review.helpers';
import { seriesLabel } from '../review.period';
import { WaterfallChart } from '../components/WaterfallChart';
import type { BridgePayload } from '../review.types';

export function BridgeNewSection({
  data,
  loading,
}: {
  data: BridgePayload | null;
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
  if (!data?.volume_ticket) {
    return (
      <EmptyState
        title="Aucun bridge"
        description="Pas de comparaison sur cette fenêtre."
      />
    );
  }

  const vt = data.volume_ticket;
  const steps = [
    {
      name: seriesLabel(data.compare, data.period),
      amount: vt.prev.amount,
      kind: 'total' as const,
    },
    {
      name: 'Volume',
      amount: vt.volume,
      kind: vt.volume >= 0 ? ('up' as const) : ('down' as const),
    },
    {
      name: 'Ticket',
      amount: vt.ticket,
      kind: vt.ticket >= 0 ? ('up' as const) : ('down' as const),
    },
    {
      name: seriesLabel(data.fy, data.period),
      amount: vt.curr.amount,
      kind: 'total' as const,
    },
  ];

  return (
    <div className="review-section">
      <header className="review-section-heading">
        <div>
          <h3 className="review-card-title">
            Écart nouvelles affaires
          </h3>
          <ScopeTag scope="new" />
        </div>
      </header>

      <div className="review-kpi-grid">
        <StatCard
          label={`CA nouv. aff. ${seriesLabel(data.compare, data.period)}`}
          value={fmtEur(vt.prev.amount)}
          scope="new"
          hint={`${vt.prev.count} signatures`}
        />
        <StatCard
          label="Effet volume"
          value={fmtEur(vt.volume)}
          hint={`Δ signatures × ticket ${data.compare}`}
        />
        <StatCard
          label="Effet ticket"
          value={fmtEur(vt.ticket)}
          hint={`Δ ticket × signatures ${data.fy}`}
        />
        <StatCard
          label={`CA nouv. aff. ${seriesLabel(data.fy, data.period)}`}
          value={fmtEur(vt.curr.amount)}
          scope="new"
          hint={`${vt.curr.count} signatures`}
        />
      </div>

      <GlassCard className="review-chart-card">
        <h3 className="review-card-title">
          Waterfall nouvelles affaires {seriesLabel(data.compare, data.period)} →{' '}
          {seriesLabel(data.fy, data.period)}
        </h3>
        <WaterfallChart
          steps={steps}
          scope="new"
          source="Salesforce · CA nouvelles affaires"
        />
        <p className="review-section-note">
          Le bridge décompose l'écart (volume, ticket) sans expliquer sa cause.
        </p>
      </GlassCard>
    </div>
  );
}
