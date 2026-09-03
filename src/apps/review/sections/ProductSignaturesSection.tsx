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
import { seriesLabel } from '../review.period';
import type { ProductPayload } from '../review.types';

const PRODUCTS = ['catalogue', 'sur_mesure', 'conseil'] as const;

/** Signatures nouvelles affaires par produit : période de référence vs période courante. */
export function ProductSignaturesSection({
  data,
  loading,
  compare,
}: {
  data: ProductPayload | null;
  loading: boolean;
  compare: string;
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
        title="Signatures par produit indisponibles"
        description="Pas de ventes nouvelles affaires sur cette fenêtre."
      />
    );
  }

  const currYear =
    data.series.find((row) => row.fy === data.fy) || data.series.at(-1);
  const prevYear = data.series.find((row) => row.fy === compare);
  const compareLabel = seriesLabel(compare, data.period);
  const fyLabel = seriesLabel(data.fy, data.period);

  const chartData = PRODUCTS.map((key) => ({
    produit: currYear?.products[key].label ?? key,
    [compareLabel]: prevYear?.products[key].won ?? 0,
    [fyLabel]: currYear?.products[key].won ?? 0,
  }));

  return (
    <div className="review-section">
      <header className="review-section-heading">
        <div>
          <h3 className="review-card-title">
            Signatures nouvelles affaires par produit
          </h3>
          <ScopeTag scope="signatures-new" />
        </div>
      </header>

      <GlassCard className="review-chart-card">
        <h4 className="review-card-title">
          {compareLabel} vs {fyLabel}
        </h4>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} barCategoryGap="28%">
            <CartesianGrid strokeDasharray="3 3" stroke="var(--xos-border)" />
            <XAxis
              dataKey="produit"
              stroke="var(--xos-border)"
              tick={{ fontSize: 11, fill: 'var(--xos-text-secondary)' }}
            />
            <YAxis
              stroke="var(--xos-border)"
              allowDecimals={false}
              tick={{ fontSize: 11, fill: 'var(--xos-text-secondary)' }}
              width={48}
            />
            <ReviewChartTooltip
              content={<ChartTooltip valueFormatter={(v) => String(v)} />}
            />
            <Legend wrapperStyle={{ color: 'var(--xos-text)' }} />
            <Bar
              dataKey={compareLabel}
              fill="#5b8def"
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey={fyLabel}
              fill="var(--xos-accent)"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
        <p className="review-section-note">
          Nombre de signatures nouvelles affaires, hors renouvellements et hors
          offres non typées.
        </p>
      </GlassCard>
    </div>
  );
}
