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
import { fmtEur } from '../review.helpers';
import { ANNUAL_ONLY_FY, FY_OPTIONS, seriesLabel, seriesSpanLabel } from '../review.period';
import type { OverviewPayload } from '../review.types';

export function PerformanceSection({
  data,
  loading,
}: {
  data: OverviewPayload | null;
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
          hint={`Nouv. aff. ${fmtEur(current?.new ?? 0)} · Renouv. ${fmtEur(current?.renew ?? 0)}`}
        />
        <StatCard
          label={`CA nouv. aff. ${seriesLabel(data.fy, data.period)}`}
          value={fmtEur(current?.new ?? 0)}
          scope="new"
        />
        <StatCard
          label={`CA renouv. ${seriesLabel(data.fy, data.period)}`}
          value={fmtEur(current?.renew ?? 0)}
          scope="total"
        />
        {current && current.other.amount > 0 ? (
          <StatCard
            label={current.other.label}
            value={fmtEur(current.other.amount)}
            hint={`${current.other.count} opp. hors catalogue / sur-mesure / conseil`}
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
              tick={{ fontSize: 11, fill: 'var(--xos-text-muted)' }}
            />
            <YAxis
              stroke="var(--xos-border)"
              tickFormatter={(v: number) => fmtEur(v)}
              tick={{ fontSize: 11, fill: 'var(--xos-text-muted)' }}
              width={72}
            />
            <ReviewChartTooltip
              content={<ChartTooltip valueFormatter={fmtEur} />}
            />
            <Legend wrapperStyle={{ color: 'var(--xos-text)' }} />
            <Bar
              dataKey="Nouvelles affaires"
              stackId="ca"
              fill="var(--xos-accent)"
              radius={[0, 0, 0, 0]}
            />
            <Bar
              dataKey="Renouvellements"
              stackId="ca"
              fill="#5b8def"
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
