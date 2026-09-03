import {
  CartesianGrid,
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

/** Évolution du CA renouvellements exercice par exercice. */
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
    Renouvellements: row.renew,
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
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--xos-border)" />
            <XAxis
              dataKey="fy"
              stroke="var(--xos-border)"
              tick={{ fontSize: 11, fill: 'var(--xos-text-secondary)' }}
            />
            <YAxis
              stroke="var(--xos-border)"
              tickFormatter={(v: number) => fmtEur(v)}
              tick={{ fontSize: 11, fill: 'var(--xos-text-secondary)' }}
              width={72}
            />
            <ReviewChartTooltip
              content={<ChartTooltip valueFormatter={fmtEur} />}
            />
            <Line
              type="monotone"
              dataKey="Renouvellements"
              stroke="#5b8def"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
        <p className="review-section-note">
          CA resigné sur les clients existants, exercice par exercice. Stock et
          flux restent deux lectures distinctes.
        </p>
      </GlassCard>
    </div>
  );
}
