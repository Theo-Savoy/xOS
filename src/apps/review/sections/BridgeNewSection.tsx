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
        description="Sélectionnez deux exercices pour décomposer le recul NEW."
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
            Bridge NEW : décomposition volume / ticket <ScopeTag scope="new" />
          </h3>
          <p className="review-section-kicker">
            Analyse NEW uniquement · {seriesLabel(data.compare, data.period)}→
            {seriesLabel(data.fy, data.period)}
          </p>
        </div>
      </header>

      <div className="review-kpi-grid">
        <StatCard
          label={`CA NEW ${seriesLabel(data.compare, data.period)}`}
          value={fmtEur(vt.prev.amount)}
          scope="new"
          hint={`${vt.prev.count} signatures`}
        />
        <StatCard
          label="Effet volume"
          value={fmtEur(vt.volume)}
          hint="Δ signatures × ticket N-1"
        />
        <StatCard
          label="Effet ticket"
          value={fmtEur(vt.ticket)}
          hint="Δ ticket × signatures N"
        />
        <StatCard
          label={`CA NEW ${seriesLabel(data.fy, data.period)}`}
          value={fmtEur(vt.curr.amount)}
          scope="new"
          hint={`${vt.curr.count} signatures`}
        />
      </div>

      <GlassCard className="review-chart-card">
        <h3 className="review-card-title">
          Waterfall NEW {seriesLabel(data.compare, data.period)} →{' '}
          {seriesLabel(data.fy, data.period)}
        </h3>
        <WaterfallChart
          steps={steps}
          scope="new"
          source="Salesforce · CA NEW"
        />
        <p className="review-section-note">
          Le bridge montre d'où vient l'écart, pas pourquoi il existe.
        </p>
      </GlassCard>
    </div>
  );
}
