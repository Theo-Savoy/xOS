import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';
import { EmptyState, GlassCard, Skeleton } from '../../../components/ui';
import { ConservationBadge } from '../components/ConservationBadge';
import { ChartTooltip, ReviewChartTooltip } from '../components/ChartTooltip';
import { ScopeTag } from '../components/ScopeTag';
import { StatCard } from '../components/StatCard';
import { fmtPct1 } from '../review.helpers';
import type { MarketMixRow, MarketPayload } from '../review.types';

const MIX_COLORS = {
  marche: '#5b8def',
  produit: 'var(--xos-accent)',
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

function fmtP(p: number | null | undefined): string {
  if (p === null || p === undefined) return '—';
  return p.toLocaleString('fr-FR', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
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
        description="Pas de motifs de perte NEW sur cette fenêtre."
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
    fy: row.fy,
    pct: row.pct,
    pctDelta:
      index > 0 ? row.pct - data.share[index - 1].pct : null,
  }));

  return (
    <div className="review-section">
      <header className="review-section-heading">
        <div>
          <h3 className="review-card-title">
            {data.conclusion} <ScopeTag scope="new" />
          </h3>
          <p className="review-section-kicker">
            Pertes NEW · part « marché / client » · motifs déclarés, pas de
            causalité
          </p>
        </div>
        <ConservationBadge conservation={data.conservation} />
      </header>

      <div className="review-kpi-grid">
        <StatCard
          label={`Part marché / client ${currentShare?.fy ?? ''}`}
          value={fmtPct1((currentShare?.pct ?? 0) / 100)}
          scope="new"
          hint={`${currentShare?.n_marche ?? 0} / ${currentShare?.n_lost ?? 0} pertes NEW`}
        />
        <StatCard
          label={`Test ${data.test.fy_from ?? ''}→${data.test.fy_to ?? ''}`}
          value={`p = ${fmtP(data.test.p)}`}
          hint={
            data.test.z === null
              ? 'deux proportions, bilatéral'
              : `z = ${data.test.z.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} · exploratoire`
          }
        />
      </div>

      <GlassCard className="review-chart-card">
        <h3 className="review-card-title">Répartition des pertes NEW par offre</h3>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={stacked} layout="vertical" margin={{ left: 24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--xos-border)" />
            <XAxis
              type="number"
              domain={[0, 100]}
              tick={{ fontSize: 11, fill: 'var(--xos-text-secondary)' }}
              unit=" %"
            />
            <YAxis
              type="category"
              dataKey="offre"
              tick={{ fontSize: 12, fill: 'var(--xos-text-secondary)' }}
              width={90}
            />
            <ReviewChartTooltip
              content={
                <ChartTooltip
                  scope="new"
                  source="Salesforce · motifs de perte NEW"
                  valueFormatter={(value) =>
                    `${value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`
                  }
                />
              }
            />
            <Legend />
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
        <p className="review-section-note">
          Les trois motifs somment à 100 % sur chaque ligne. Prix est déduit du
          reliquat déclaré.
        </p>
      </GlassCard>

      <GlassCard className="review-chart-card">
        <h3 className="review-card-title">
          Part marché / client {data.share[0]?.fy}→{data.fy}
        </h3>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={series}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--xos-border)" />
            <XAxis
              dataKey="fy"
              tick={{ fontSize: 11, fill: 'var(--xos-text-secondary)' }}
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'var(--xos-text-secondary)' }}
              unit=" %"
            />
            <ReviewChartTooltip
              content={
                <ChartTooltip
                  scope="new"
                  source="Salesforce · pertes NEW marché / client"
                  compareLabel="période comparable"
                  deltaKeys={{ pct: 'pctDelta' }}
                  valueFormatter={(value) =>
                    `${value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`
                  }
                  deltaFormatter={(value) =>
                    `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} pt`
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
        <p className="review-section-note">
          Le test {data.test.fy_from ?? 'N-1'}→{data.test.fy_to ?? 'N'} ne
          prouve pas l'aggravation : le signal domine, p reste au-dessus de
          0,05.
        </p>
      </GlassCard>
    </div>
  );
}
