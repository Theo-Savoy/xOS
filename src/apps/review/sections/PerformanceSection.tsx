import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';
import { EmptyState, GlassCard, Skeleton } from '../../../components/ui';
import { ChartTooltip, ReviewChartTooltip } from '../components/ChartTooltip';
import { ScopeTag } from '../components/ScopeTag';
import { StatCard } from '../components/StatCard';
import { fmtEur, fmtPctDelta } from '../review.helpers';
import { ANNUAL_ONLY_FY, FY_OPTIONS, seriesLabel, seriesSpanLabel } from '../review.period';
import type { OverviewPayload } from '../review.types';

export function PerformanceSection({
  data,
  loading,
  compare,
}: {
  data: OverviewPayload | null;
  loading: boolean;
  compare: string;
}) {
  if (loading && !data) {
    return (
      <div className="review-section">
        <Skeleton height={120} />
        <Skeleton height={280} />
      </div>
    );
  }
  if (!data?.series?.length) {
    const targetFy = data?.fy || ANNUAL_ONLY_FY;
    return (
      <EmptyState
        title="Aucune série"
        description={`Pas de CA sur la fenêtre ${seriesLabel(targetFy, data?.period)}.`}
      />
    );
  }

  const current =
    data.series.find((row) => row.fy === data.fy) || data.series.at(-1);
  const reference = data.series.find((row) => row.fy === compare);
  const pctVsRef = (
    value: number | undefined,
    refValue: number | undefined,
  ): string | undefined => {
    if (value === undefined || !refValue) return undefined;
    return fmtPctDelta(((value - refValue) / Math.abs(refValue)) * 100);
  };
  const chartData = data.series.map((row, index) => {
    const previous = data.series[index - 1];
    return {
      fy: seriesLabel(row.fy, data.period),
      'Nouvelles affaires': row.new,
      Renouvellements: row.renew,
      NEWDelta: previous ? row.new - previous.new : null,
      RENEWDelta: previous ? row.renew - previous.renew : null,
    };
  });

  return (
    <div className="review-section">
      <header className="review-section-heading">
        <div>
          <h3 className="review-card-title">
            Nouvelles affaires et renouvellements
          </h3>
          <ScopeTag scope="total" />
        </div>
      </header>

      <div className="review-kpi-grid">
        <StatCard
          label={`CA total ${seriesLabel(data.fy, data.period)}`}
          value={fmtEur(current?.total ?? 0)}
          scope="total"
          hint={pctVsRef(current?.total, reference?.total)}
        />
        <StatCard
          label={`Nouvelles affaires ${seriesLabel(data.fy, data.period)}`}
          value={fmtEur(current?.new ?? 0)}
          scope="new"
          hint={pctVsRef(current?.new, reference?.new)}
        />
        <StatCard
          label={`Renouvellements ${seriesLabel(data.fy, data.period)}`}
          value={fmtEur(current?.renew ?? 0)}
          scope="total"
          hint={pctVsRef(current?.renew, reference?.renew)}
        />
        {current && current.other.amount > 0 ? (
          <StatCard
            label={current.other.label}
            value={fmtEur(current.other.amount)}
            hint={pctVsRef(current.other.amount, reference?.other.amount)}
          />
        ) : null}
      </div>

      <GlassCard className="review-chart-card">
        <h3 className="review-card-title">
          {seriesSpanLabel(data.series[0]?.fy || FY_OPTIONS[0].value, data.fy, data.period)}
        </h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData}>
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
            <Legend wrapperStyle={{ color: 'var(--xos-text)' }} />
            <Bar
              dataKey="Nouvelles affaires"
              stackId="ca"
              fill="var(--xos-chart-current)"
              radius={[0, 0, 0, 0]}
            />
            <Bar
              dataKey="Renouvellements"
              stackId="ca"
              fill="var(--xos-chart-compare)"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
        <p className="review-section-note">
          Rien n'est causal : les deux composantes reculent, sans dire pourquoi.
          {data.truncated
            ? ' · Fenêtre SOQL tronquée — chiffres incomplets.'
            : ''}
        </p>
      </GlassCard>
    </div>
  );
}
