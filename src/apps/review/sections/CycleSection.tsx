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
import { StatCard } from '../components/StatCard';
import { fmtDays } from '../review.helpers';
import { seriesLabel, seriesSpanLabel } from '../review.period';
import type { CyclesPayload } from '../review.types';

const PRODUCT_ORDER = ['catalogue', 'sur_mesure', 'conseil', 'autre'] as const;
const PRODUCT_LABELS: Record<(typeof PRODUCT_ORDER)[number], string> = {
  catalogue: 'Catalogue',
  sur_mesure: 'Sur-mesure',
  conseil: 'Conseil',
  autre: 'Autre / non défini',
};

export function CycleSection({
  data,
  loading,
}: {
  data: CyclesPayload | null;
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
        title="Aucun cycle"
        description={`Pas de dates exploitables sur la fenêtre ${seriesSpanLabel('FY22', 'FY26', data?.period)}.`}
      />
    );
  }

  const current =
    data.series.find((row) => row.fy === data.fy) || data.series.at(-1);
  const chartData = data.series.map((row, index) => {
    const previous = data.series[index - 1];
    return {
      fy: seriesLabel(row.fy, data.period),
      Médiane: row.median,
      Moyenne: row.mean,
      medianDelta:
        previous?.median != null && row.median != null
          ? row.median - previous.median
          : null,
      meanDelta:
        previous?.mean != null && row.mean != null
          ? row.mean - previous.mean
          : null,
    };
  });

  return (
    <div className="review-section">
      <header className="review-section-heading">
        <div>
          <h3 className="review-card-title">
            Cycles de vente NEW : médiane, moyenne et exclusions{' '}
            <ScopeTag scope="signatures-new" />
          </h3>
          <p className="review-section-kicker">
            Signatures NEW · n valide affiché avec chaque agrégat
          </p>
        </div>
      </header>

      <div className="review-kpi-grid">
        <StatCard
          label={`Médiane ${seriesLabel(current?.fy ?? '', data.period)}`}
          value={fmtDays(current?.median)}
          scope="signatures-new"
          hint={`${current?.n_valid ?? 0} cycles valides`}
        />
        <StatCard
          label="Moyenne"
          value={fmtDays(current?.mean)}
          hint={`${current?.n_excluded ?? 0} exclus (négatifs)`}
        />
        <StatCard
          label="> 365 j"
          value={String(current?.n_over_365 ?? 0)}
          hint={`dont ${current?.n_over_730 ?? 0} > 730 j`}
        />
      </div>

      <GlassCard className="review-chart-card">
        <h3 className="review-card-title">
          Médiane et moyenne {seriesSpanLabel('FY22', data.fy, data.period)}
        </h3>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--xos-border)" />
            <XAxis
              dataKey="fy"
              tick={{ fontSize: 11, fill: 'var(--xos-text-muted)' }}
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'var(--xos-text-muted)' }}
              width={40}
            />
            <ReviewChartTooltip
              content={
                <ChartTooltip
                  scope="signatures-new"
                  source="Salesforce · cycles NEW exploitables"
                  compareLabel="période comparable"
                  deltaKeys={{ Médiane: 'medianDelta', Moyenne: 'meanDelta' }}
                  valueFormatter={(value) => fmtDays(value)}
                  deltaFormatter={(value) =>
                    `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(Math.round(value))} j`
                  }
                />
              }
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="Médiane"
              stroke="var(--xos-accent)"
              strokeWidth={2}
              dot
            />
            <Line
              type="monotone"
              dataKey="Moyenne"
              stroke="#5b8def"
              strokeWidth={2}
              dot
            />
          </LineChart>
        </ResponsiveContainer>
      </GlassCard>

      <GlassCard className="review-chart-card">
        <h3 className="review-card-title">
          Cycles par produit {seriesLabel(current?.fy ?? '', data.period)}
        </h3>
        <table className="review-data-table">
          <thead>
            <tr>
              <th>Produit</th>
              <th>Médiane</th>
              <th>Moyenne</th>
              <th>n valide</th>
              <th>Exclus</th>
            </tr>
          </thead>
          <tbody>
            {PRODUCT_ORDER.map((key) => {
              const row = current?.by_product[key];
              if (!row) return null;
              return (
                <tr key={key}>
                  <td>{PRODUCT_LABELS[key]}</td>
                  <td>{fmtDays(row.median)}</td>
                  <td>{fmtDays(row.mean)}</td>
                  <td>{row.n}</td>
                  <td>{row.n_excluded ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="review-section-note">
          Les cycles négatifs (CloseDate &lt; CreatedDate) sont exclus du calcul
          et comptés à part. Les cycles &gt; 365 j restent dans la moyenne.
          {data.truncated ? ' · Fenêtre SOQL tronquée.' : ''}
        </p>
      </GlassCard>
    </div>
  );
}
