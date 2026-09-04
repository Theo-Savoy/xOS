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
import { fmtEur } from '../review.helpers';
import type { ProductPayload } from '../review.types';

/**
 * CA nouvelles affaires par produit, année par année :
 * trois barres (une par produit) pour chaque exercice de la série.
 */
export function ProductTrendSection({
  data,
  loading,
}: {
  data: ProductPayload | null;
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
        title="Évolution par produit indisponible"
        description="Pas de ventes nouvelles affaires sur cette fenêtre."
      />
    );
  }

  const chartData = data.series.map((year) => ({
    fy: year.fy,
    Catalogue: year.products.catalogue.amountNew,
    'Sur-mesure': year.products.sur_mesure.amountNew,
    Conseil: year.products.conseil.amountNew,
  }));

  return (
    <div className="review-section">
      <header className="review-section-heading">
        <div>
          <h3 className="review-card-title">
            CA nouvelles affaires par produit
          </h3>
          <ScopeTag scope="signatures-new" />
        </div>
      </header>

      <GlassCard className="review-chart-card">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} barCategoryGap="24%">
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
              content={<ChartTooltip valueFormatter={(v) => fmtEur(v)} />}
            />
            <Legend wrapperStyle={{ color: 'var(--xos-text)' }} />
            <Bar dataKey="Catalogue" fill="var(--xos-chart-current)" radius={[4, 4, 0, 0]} />
            <Bar
              dataKey="Sur-mesure"
              fill="var(--xos-chart-compare)"
              radius={[4, 4, 0, 0]}
            />
            <Bar dataKey="Conseil" fill="var(--xos-accent-success)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <p className="review-section-note">
          CA signé par exercice et par produit, nouvelles affaires uniquement.
        </p>
      </GlassCard>
    </div>
  );
}
