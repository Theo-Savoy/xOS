import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';
import { EmptyState, GlassCard, Skeleton } from '../../../components/ui';
import { ChartTooltip, ReviewChartTooltip } from '../components/ChartTooltip';
import { ScopeTag } from '../components/ScopeTag';
import { fmtEur } from '../review.helpers';
import { FY_OPTIONS, seriesLabel, seriesSpanLabel } from '../review.period';
import type { OverviewPayload } from '../review.types';

function fmtPct(value: number): string {
  return `${value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
}

/** Renouvellements exercice par exercice : montant et part du CA total. */
export function RenewTrendSection({
  data,
  loading,
}: {
  data: OverviewPayload | null;
  loading: boolean;
}) {
  if (loading && !data) {
    return (
      <div className="review-section">
        <Skeleton height={280} />
      </div>
    );
  }
  if (!data?.series?.length) {
    return (
      <EmptyState
        title="Évolution des renouvellements indisponible"
        description="Aucune série de renouvellements sur cette fenêtre."
      />
    );
  }

  const chartData = data.series.map((row) => ({
    fy: seriesLabel(row.fy, data.period),
    renew: row.renew,
    part: row.total > 0 ? (row.renew / row.total) * 100 : 0,
  }));

  return (
    <div className="review-section">
      <header className="review-section-heading">
        <div>
          <h3 className="review-card-title">
            Évolution du volume renouvellements
          </h3>
          <ScopeTag scope="total" />
        </div>
      </header>

      <GlassCard className="review-chart-card">
        <h4 className="review-card-title">
          {seriesSpanLabel(
            data.series[0]?.fy || FY_OPTIONS[0].value,
            data.fy,
            data.period,
          )}
        </h4>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--xos-border)" />
            <XAxis
              dataKey="fy"
              stroke="var(--xos-border)"
              tick={{ fontSize: 11, fill: 'var(--xos-text-secondary)' }}
            />
            <YAxis
              yAxisId="montant"
              stroke="var(--xos-border)"
              tickFormatter={(v: number) => fmtEur(v)}
              tick={{ fontSize: 11, fill: 'var(--xos-text-secondary)' }}
              width={72}
            />
            <YAxis
              yAxisId="part"
              orientation="right"
              stroke="var(--xos-border)"
              domain={[0, 100]}
              unit=" %"
              tick={{ fontSize: 11, fill: 'var(--xos-text-secondary)' }}
              width={56}
            />
            <ReviewChartTooltip
              content={
                <ChartTooltip
                  valueFormatter={(value, dataKey) =>
                    dataKey === 'part' ? fmtPct(value) : fmtEur(value)
                  }
                />
              }
            />
            <Legend wrapperStyle={{ color: 'var(--xos-text)' }} />
            <Line
              yAxisId="montant"
              type="monotone"
              dataKey="renew"
              name="Renouvellements"
              stroke="var(--xos-chart-compare)"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
            <Line
              yAxisId="part"
              type="monotone"
              dataKey="part"
              name="Part du CA total"
              stroke="var(--xos-chart-current)"
              strokeWidth={2}
              strokeDasharray="4 3"
              dot={{ r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
        <p className="review-section-note">
          CA resigné sur les clients existants (axe gauche) et sa part dans le
          CA total de l&apos;exercice (axe droit).
        </p>
      </GlassCard>
    </div>
  );
}
