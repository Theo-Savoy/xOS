import { EmptyState, GlassCard, Skeleton } from '../../../components/ui';
import { ScopeTag } from '../components/ScopeTag';
import { StatCard } from '../components/StatCard';
import {
  WaterfallChart,
  type WaterfallStep,
} from '../components/WaterfallChart';
import { fmtEur, fmtNum } from '../review.helpers';
import { seriesLabel } from '../review.period';
import { productivityOf, type CommercialPayload } from '../review.types';

export function CapacitySection({
  data,
  loading,
}: {
  data: CommercialPayload | null;
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
  if (!data?.ownerBridge) {
    return (
      <EmptyState
        title="Aucune capacité"
        description="Pas de comparaison sur cette fenêtre."
      />
    );
  }

  const bridge = data.ownerBridge;
  const prevTotal = bridge.active.prev + bridge.dg.prev + bridge.departed.prev;
  const currTotal = bridge.active.curr + bridge.dg.curr + bridge.departed.curr;
  const steps: WaterfallStep[] = [
    {
      name: seriesLabel(data.compare, data.period),
      amount: prevTotal,
      kind: 'total',
    },
    {
      name: 'Actifs',
      amount: bridge.active.delta,
      kind: bridge.active.delta >= 0 ? 'up' : 'down',
    },
    {
      name: 'PDG',
      amount: bridge.dg.delta,
      kind: bridge.dg.delta >= 0 ? 'up' : 'down',
    },
    {
      name: 'Partis',
      amount: bridge.departed.delta,
      kind: bridge.departed.delta >= 0 ? 'up' : 'down',
    },
    {
      name: seriesLabel(data.fy, data.period),
      amount: currTotal,
      kind: 'total',
    },
  ];

  return (
    <div className="review-section">
      <header className="review-section-heading">
        <div>
          <h3 className="review-card-title">
            Écart Owner
          </h3>
          <ScopeTag scope="new" />
        </div>
      </header>

      <GlassCard className="review-chart-card">
        <h3 className="review-card-title">
          Cadrage Owner
        </h3>
        <div className="review-kpi-grid">
          <StatCard
            label={bridge.active.label}
            value={fmtEur(bridge.active.delta)}
            hint={`${fmtEur(bridge.active.prev)} → ${fmtEur(bridge.active.curr)}`}
          />
          <StatCard
            label={bridge.dg.label}
            value={fmtEur(bridge.dg.delta)}
            hint={`${fmtEur(bridge.dg.prev)} → ${fmtEur(bridge.dg.curr)}`}
          />
          <StatCard
            label={bridge.departed.label}
            value={fmtEur(bridge.departed.delta)}
            hint={`${fmtEur(bridge.departed.prev)} → ${fmtEur(bridge.departed.curr)}`}
          />
        </div>
        <WaterfallChart
          steps={steps}
          scope="new"
          source="Salesforce · CA NEW par Owner courant"
        />
        <p className="review-section-note">
          {fmtEur(bridge.total)} = actifs − PDG − partis.{' '}
          {data.attribution_limit}
        </p>
      </GlassCard>

      <GlassCard className="review-chart-card">
        <h3 className="review-card-title">Équipe active — Paul / Christophe</h3>
        <table className="review-data-table">
          <thead>
            <tr>
              <th>Exercice</th>
              <th>CA NEW</th>
              <th>Signatures NEW</th>
              <th>Détections</th>
            </tr>
          </thead>
          <tbody>
            {data.capacity.map((row) => (
              <tr
                key={row.fy}
                className={
                  row.fy === data.fy ? 'review-data-table__current' : undefined
                }
              >
                <td>{seriesLabel(row.fy, data.period)}</td>
                <td>{fmtEur(row.amountNew)}</td>
                <td>{row.signaturesNew}</td>
                <td>{row.detections}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="review-section-note">
          Jérôme (PDG) et le SDR sont hors de cette série.{' '}
          {data.period?.granularity === 'semester' || /S[12]$/.test(data.fy)
            ? 'ETP annuels : '
            : 'ETP sales : '}
          {fmtNum(productivityOf(data, data.compare)?.fte ?? null, 2)} →{' '}
          {fmtNum(productivityOf(data, data.fy)?.fte ?? null, 2)}.
        </p>
      </GlassCard>
    </div>
  );
}
