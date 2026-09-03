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
import { ConservationBadge } from '../components/ConservationBadge';
import { ChartTooltip, ReviewChartTooltip } from '../components/ChartTooltip';
import { ScopeTag } from '../components/ScopeTag';
import { StatCard } from '../components/StatCard';
import { fmtEur } from '../review.helpers';
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
    return (
      <EmptyState
        title="Aucune série"
        description="Pas de CA NEW / RENEW sur la fenêtre FY22→FY26."
      />
    );
  }

  const current =
    data.series.find((row) => row.fy === data.fy) || data.series.at(-1);
  const chartData = data.series.map((row, index) => {
    const previous = data.series[index - 1];
    return {
      fy: row.fy,
      NEW: row.new,
      RENEW: row.renew,
      NEWDelta: previous ? row.new - previous.new : null,
      RENEWDelta: previous ? row.renew - previous.renew : null,
    };
  });

  return (
    <div className="review-section">
      <header className="review-section-heading">
        <div>
          <h3 className="review-card-title">
            NEW et RENEW reculent ensemble <ScopeTag scope="total" />
          </h3>
          <p className="review-section-kicker">
            CA total · FY22→{data.fy} · le stock ARR catalogue n'est pas un flux
          </p>
        </div>
        <ConservationBadge conservation={data.conservation} />
      </header>

      <div className="review-kpi-grid">
        <StatCard
          label={`CA total ${data.fy}`}
          value={fmtEur(current?.total ?? 0)}
          scope="total"
          hint={`NEW ${fmtEur(current?.new ?? 0)} · RENEW ${fmtEur(current?.renew ?? 0)}`}
        />
        <StatCard
          label={`CA NEW ${data.fy}`}
          value={fmtEur(current?.new ?? 0)}
          scope="new"
        />
        <StatCard
          label={`CA RENEW ${data.fy}`}
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
          Série empilée FY22→{data.fy}
        </h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--xos-border)" />
            <XAxis
              dataKey="fy"
              tick={{ fontSize: 11, fill: 'var(--xos-text-muted)' }}
            />
            <YAxis
              tickFormatter={(v: number) => fmtEur(v)}
              tick={{ fontSize: 11, fill: 'var(--xos-text-muted)' }}
              width={72}
            />
            <ReviewChartTooltip
              content={
                <ChartTooltip
                  scope="total"
                  source="Salesforce · CA total (NEW + RENEW)"
                  compareLabel="période comparable"
                  deltaKeys={{ NEW: 'NEWDelta', RENEW: 'RENEWDelta' }}
                  valueFormatter={fmtEur}
                  deltaFormatter={fmtEur}
                />
              }
            />
            <Legend />
            <Bar
              dataKey="NEW"
              stackId="ca"
              fill="var(--xos-accent)"
              radius={[0, 0, 0, 0]}
            />
            <Bar
              dataKey="RENEW"
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
