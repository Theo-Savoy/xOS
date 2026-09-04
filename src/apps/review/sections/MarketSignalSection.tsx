import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';
import { EmptyState, GlassCard, Skeleton } from '../../../components/ui';
import { ChartLegend } from '../components/ChartLegend';
import { ChartTooltip, ReviewChartTooltip } from '../components/ChartTooltip';
import { ScopeTag } from '../components/ScopeTag';
import { StatCard } from '../components/StatCard';
import { fmtPct1 } from '../review.helpers';
import { seriesLabel } from '../review.period';
import type { MarketMixRow, MarketPayload } from '../review.types';

const MIX_COLORS = {
  marche: 'var(--xos-chart-compare)',
  produit: 'var(--xos-chart-current)',
  prix: '#f0a35e',
};

function mixRow(label: string, row: MarketMixRow | undefined) {
  return {
    offre: label,
    'Marché / client': row?.marche_pct ?? 0,
    'Produit / réponse XOS': row?.produit_pct ?? 0,
    Prix: row?.prix_pct ?? 0,
  };
}

export function MarketSignalSection({
  data,
  loading,
}: {
  data: MarketPayload | null;
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
  if (!data?.share?.length) {
    return (
      <EmptyState
        title="Aucun signal marché"
        description="Pas de motifs de perte sur cette fenêtre."
      />
    );
  }

  const currentShare =
    data.share.find((row) => row.fy === data.fy) || data.share.at(-1);
  const stacked = [
    mixRow('Global', data.mix.global),
    mixRow('Catalogue', data.mix.catalogue),
    mixRow('Sur-mesure', data.mix.sur_mesure),
  ];
  const series = data.share.map((row, index) => ({
    fy: seriesLabel(row.fy, data.period),
    pct: row.pct,
    pctDelta: index > 0 ? row.pct - data.share[index - 1].pct : null,
  }));

  return (
    <div className="review-section">
      <header className="review-section-heading">
        <div>
          <h3 className="review-card-title">
            Pertes marché / client
          </h3>
          <ScopeTag scope="new" />
        </div>
      </header>

      <div className="review-kpi-grid">
        <StatCard
          label={`Part marché / client ${seriesLabel(currentShare?.fy ?? '', data.period)}`}
          value={fmtPct1((currentShare?.pct ?? 0) / 100)}
          scope="new"
          hint={`${currentShare?.n_marche ?? 0} / ${currentShare?.n_lost ?? 0} pertes (nouvelles affaires)`}
        />
      </div>

      <GlassCard className="review-chart-card">
        <h3 className="review-card-title">
          Répartition des pertes nouvelles affaires par offre
        </h3>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={stacked} layout="vertical" margin={{ left: 24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--xos-border)" />
            <XAxis
              type="number"
              domain={[0, 100]}
              tick={{ fontSize: 11, fill: 'var(--xos-text-secondary)' }}
              stroke="var(--xos-border)"
              unit=" %"
            />
            <YAxis
              type="category"
              dataKey="offre"
              tick={{ fontSize: 12, fill: 'var(--xos-text-secondary)' }}
              stroke="var(--xos-border)"
              width={90}
            />
            <ReviewChartTooltip
              content={
                <ChartTooltip
                  valueFormatter={(value) =>
                    `${value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`
                  }
                />
              }
            />
            <Bar
              dataKey="Marché / client"
              stackId="mix"
              fill={MIX_COLORS.marche}
            />
            <Bar
              dataKey="Produit / réponse XOS"
              stackId="mix"
              fill={MIX_COLORS.produit}
            />
            <Bar dataKey="Prix" stackId="mix" fill={MIX_COLORS.prix} />
          </BarChart>
        </ResponsiveContainer>
        <ChartLegend
          items={[
            { label: 'Marché / client', color: MIX_COLORS.marche },
            { label: 'Produit / réponse XOS', color: MIX_COLORS.produit },
            { label: 'Prix', color: MIX_COLORS.prix },
          ]}
        />
        <p className="review-section-note">
          Chaque ligne totalise 100 % : marché, produit et prix couvrent toutes les pertes déclarées.
        </p>
      </GlassCard>

      <GlassCard className="review-chart-card">
        <h3 className="review-card-title">
          Part marché / client{' '}
          {seriesLabel(data.share[0]?.fy ?? '', data.period)}→
          {seriesLabel(data.fy, data.period)}
        </h3>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={series}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--xos-border)" />
            <XAxis
              dataKey="fy"
              tick={{ fontSize: 11, fill: 'var(--xos-text-secondary)' }}
              stroke="var(--xos-border)"
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'var(--xos-text-secondary)' }}
              stroke="var(--xos-border)"
              unit=" %"
            />
            <ReviewChartTooltip
              content={
                <ChartTooltip
                  valueFormatter={(value) =>
                    `${value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`
                  }
                />
              }
            />
            <Line
              type="linear"
              dataKey="pct"
              name="Marché / client"
              stroke={MIX_COLORS.marche}
              strokeWidth={2}
              dot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </GlassCard>
    </div>
  );
}
