import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';
import { EmptyState, GlassCard, Skeleton } from '../../../components/ui';
import { ChartTooltip, ReviewChartTooltip } from '../components/ChartTooltip';
import { ScopeTag } from '../components/ScopeTag';
import { fmtEur } from '../review.helpers';
import { seriesLabel } from '../review.period';
import type { ProductPayload } from '../review.types';

const PRODUCTS = ['catalogue', 'sur_mesure', 'conseil'] as const;

/**
 * Double entrée par produit : le CA nouvelles affaires en barres (axe gauche)
 * et le nombre de signatures en courbes (axe droit), référence vs période.
 */
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
    caCompare: prevYear?.products[key].amountNew ?? 0,
    caFy: currYear?.products[key].amountNew ?? 0,
    signaturesCompare: prevYear?.products[key].won ?? 0,
    signaturesFy: currYear?.products[key].won ?? 0,
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
          CA et signatures — {compareLabel} vs {fyLabel}
        </h4>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={chartData} barCategoryGap="28%">
            <CartesianGrid strokeDasharray="3 3" stroke="var(--xos-border)" />
            <XAxis
              dataKey="produit"
              stroke="var(--xos-border)"
              tick={{ fontSize: 11, fill: 'var(--xos-text-secondary)' }}
            />
            <YAxis
              yAxisId="ca"
              stroke="var(--xos-border)"
              tickFormatter={(v: number) => fmtEur(v)}
              tick={{ fontSize: 11, fill: 'var(--xos-text-secondary)' }}
              width={72}
            />
            <YAxis
              yAxisId="signatures"
              orientation="right"
              stroke="var(--xos-border)"
              allowDecimals={false}
              tick={{ fontSize: 11, fill: 'var(--xos-text-secondary)' }}
              width={44}
            />
            <ReviewChartTooltip
              content={
                <ChartTooltip
                  valueFormatter={(value, dataKey) =>
                    dataKey?.startsWith('ca') ? fmtEur(value) : String(value)
                  }
                />
              }
            />
            <Legend wrapperStyle={{ color: 'var(--xos-text)' }} />
            <Bar
              yAxisId="ca"
              dataKey="caCompare"
              name={`CA ${compareLabel}`}
              fill="#5b8def"
              radius={[4, 4, 0, 0]}
            />
            <Bar
              yAxisId="ca"
              dataKey="caFy"
              name={`CA ${fyLabel}`}
              fill="var(--xos-accent)"
              radius={[4, 4, 0, 0]}
            />
            <Line
              yAxisId="signatures"
              type="monotone"
              dataKey="signaturesCompare"
              name={`Signatures ${compareLabel}`}
              stroke="var(--xos-accent-warning)"
              strokeWidth={2}
              strokeDasharray="4 3"
              dot={{ r: 3 }}
            />
            <Line
              yAxisId="signatures"
              type="monotone"
              dataKey="signaturesFy"
              name={`Signatures ${fyLabel}`}
              stroke="var(--xos-accent-success)"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
        <p className="review-section-note">
          Barres : CA nouvelles affaires (axe gauche). Courbes : nombre de
          signatures (axe droit). Hors renouvellements et hors offres non
          typées.
        </p>
      </GlassCard>
    </div>
  );
}
