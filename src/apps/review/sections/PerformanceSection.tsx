import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { EmptyState, GlassCard, Skeleton } from '../../../components/ui';
import { ConservationBadge } from '../components/ConservationBadge';
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

  const fy26 =
    data.series.find((row) => row.fy === 'FY26') || data.series.at(-1);
  const chartData = data.series.map((row) => ({
    fy: row.fy,
    NEW: row.new,
    RENEW: row.renew,
  }));

  return (
    <div className="review-section">
      <header className="review-section-heading">
        <div>
          <h3 className="review-card-title">
            NEW et RENEW reculent ensemble <ScopeTag scope="total" />
          </h3>
          <p className="review-section-kicker">
            CA total · FY22→FY26 · le stock ARR catalogue n'est pas un flux
          </p>
        </div>
        <ConservationBadge conservation={data.conservation} />
      </header>

      <div className="review-kpi-grid">
        <StatCard
          label="CA total FY26"
          value={fmtEur(fy26?.total ?? 0)}
          scope="total"
          hint={`NEW ${fmtEur(fy26?.new ?? 0)} · RENEW ${fmtEur(fy26?.renew ?? 0)}`}
        />
        <StatCard
          label="CA NEW FY26"
          value={fmtEur(fy26?.new ?? 0)}
          scope="new"
        />
        <StatCard
          label="CA RENEW FY26"
          value={fmtEur(fy26?.renew ?? 0)}
          scope="total"
        />
        {fy26 && fy26.other.amount > 0 ? (
          <StatCard
            label={fy26.other.label}
            value={fmtEur(fy26.other.amount)}
            hint={`${fy26.other.count} opp. hors catalogue / sur-mesure / conseil`}
          />
        ) : null}
      </div>

      <GlassCard className="review-chart-card">
        <h3 className="review-card-title">Série empilée NEW / RENEW</h3>
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
            <Tooltip formatter={(v) => fmtEur(Number(v))} />
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
