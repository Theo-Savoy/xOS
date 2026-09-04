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
 * CA par produit, année par année : trois barres (une par produit) pour
 * chaque exercice de la série. scope 'new' = nouvelles affaires seulement
 * (Trajectoire), 'total' = new + renew confondus (Synthèse).
 */
export function ProductTrendSection({
  data,
  loading,
  scope = 'new',
}: {
  data: ProductPayload | null;
  loading: boolean;
  scope?: 'new' | 'total';
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
        title={
          scope === 'total'
            ? 'CA par produit indisponible'
            : 'Évolution par produit indisponible'
        }
        description="Pas de ventes nouvelles affaires sur cette fenêtre."
      />
    );
  }

  const amountOf = (row: { amountNew: number; amount_total: number }) =>
    scope === 'total' ? row.amount_total : row.amountNew;
  const chartData = data.series.map((year) => ({
    fy: year.fy,
    Catalogue: amountOf(year.products.catalogue),
    'Sur-mesure': amountOf(year.products.sur_mesure),
    Conseil: amountOf(year.products.conseil),
  }));
  const title =
    scope === 'total' ? 'CA par produit' : 'CA nouvelles affaires par produit';

  return (
    <div className="review-section">
      <header className="review-section-heading">
        <div>
          <h3 className="review-card-title">{title}</h3>
          <ScopeTag scope={scope === 'total' ? 'total' : 'signatures-new'} />
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
              fill="var(--xos-chart-mid)"
              radius={[4, 4, 0, 0]}
            />
            <Bar dataKey="Conseil" fill="var(--xos-chart-compare)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <p className="review-section-note">
          {scope === 'total'
            ? 'CA signé par exercice et par produit, renouvellements inclus.'
            : 'CA signé par exercice et par produit, nouvelles affaires uniquement.'}
        </p>
      </GlassCard>
    </div>
  );
}
