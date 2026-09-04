import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';
import { Button, EmptyState, GlassCard, Skeleton } from '../../../components/ui';
import { ChartTooltip, ReviewChartTooltip } from '../components/ChartTooltip';
import { ScopeTag } from '../components/ScopeTag';
import { StatCard } from '../components/StatCard';
import { fmtEur, fmtPct1 } from '../review.helpers';
import type { ChannelsPayload } from '../review.types';

type ChannelMetric = 'amount' | 'won' | 'closing';

const METRICS: { key: ChannelMetric; label: string; title: string }[] = [
  { key: 'amount', label: 'CA', title: 'Canaux par CA' },
  { key: 'won', label: 'Signatures', title: 'Canaux par signatures' },
  { key: 'closing', label: 'Closing', title: 'Canaux par closing' },
];

function channelValue(row: {
  amount: number;
  won: number;
  closing: number | null;
  closing_pct: number;
}, metric: ChannelMetric): number {
  if (metric === 'amount') return row.amount;
  if (metric === 'won') return row.won;
  return row.closing_pct;
}

function formatChannelValue(value: number, metric: ChannelMetric): string {
  if (metric === 'amount') return fmtEur(value);
  if (metric === 'won') return String(Math.round(value));
  return `${value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
}

function shortLabel(label: string): string {
  return label.length > 22 ? `${label.slice(0, 20)}…` : label;
}

export function ChannelsSection({
  data,
  loading,
}: {
  data: ChannelsPayload | null;
  loading: boolean;
}) {
  const [metric, setMetric] = useState<ChannelMetric>('amount');

  if (loading && !data) {
    return (
      <div className="review-section">
        <Skeleton height={120} />
        <Skeleton height={220} />
      </div>
    );
  }
  if (!data?.channels) {
    return (
      <EmptyState
        title="Aucun canal sur la période"
        description="Aucune campagne de nouvelles affaires sur cette fenêtre."
      />
    );
  }

  const topN = data.concentration.n_displayed;
  const topNPct =
    data.concentration.topN_pct ?? data.concentration.top5_pct;
  // Graphe = catégories de canaux, lignes à 0 exclues.
  const chartData = data.channels.items
    .filter((row) =>
      metric === 'amount'
        ? row.amount > 0
        : metric === 'won'
          ? row.won > 0
          : true,
    )
    .map((row) => ({
      canal: row.label,
      valeur: channelValue(row, metric),
    }));
  const chartHeight = Math.max(220, chartData.length * 28);
  const metricMeta = METRICS.find((item) => item.key === metric) || METRICS[0];
  const detailRows = data.channels.details ?? data.channels.items;

  return (
    <div className="review-section">
      <header className="review-section-heading">
        <div>
          <h3 className="review-card-title">Canaux</h3>
          <ScopeTag scope="new" />
          <p className="review-section-kicker">
            {data.channels.n_total} canaux · lecture complète, sans top-N masqué
          </p>
        </div>
      </header>

      <div className="review-kpi-grid">
        <StatCard
          label="Top 1"
          value={fmtPct1(data.concentration.top1_pct / 100)}
          scope="total"
          hint="CA total, renouvellements inclus"
        />
        <StatCard
          label={`Top ${topN}`}
          value={fmtPct1(topNPct / 100)}
          scope="total"
          hint={`${topN} / ${data.concentration.n_total} comptes`}
        />
      </div>

      <GlassCard className="review-chart-card">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 'var(--xos-space-2)',
            marginBottom: 'var(--xos-space-3)',
          }}
        >
          <h3 className="review-card-title">{metricMeta.title}</h3>
          <div
            className="review-period-selector"
            role="tablist"
            aria-label="Métrique des canaux"
          >
            {METRICS.map((item) => (
              <Button
                key={item.key}
                type="button"
                variant="ghost"
                size="sm"
                role="tab"
                aria-selected={metric === item.key}
                className={
                  metric === item.key ? 'review-period-button--active' : ''
                }
                onClick={() => setMetric(item.key)}
              >
                {item.label}
              </Button>
            ))}
          </div>
        </div>
        {chartData.length ? (
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 8 }}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--xos-border)"
              />
              <XAxis
                type="number"
                tick={{ fontSize: 11, fill: 'var(--xos-text-secondary)' }}
                stroke="var(--xos-border)"
                tickFormatter={(value: number) =>
                  formatChannelValue(value, metric)
                }
              />
              <YAxis
                type="category"
                dataKey="canal"
                tick={{ fontSize: 11, fill: 'var(--xos-text-secondary)' }}
                stroke="var(--xos-border)"
                width={140}
                tickFormatter={shortLabel}
              />
              <ReviewChartTooltip
                content={
                  <ChartTooltip
                    valueFormatter={(value) =>
                      formatChannelValue(value, metric)
                    }
                  />
                }
              />
              <Bar
                dataKey="valeur"
                name={metricMeta.label}
                fill="var(--xos-accent)"
                radius={[0, 4, 4, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="review-section-note">Aucun canal renseigné.</p>
        )}
      </GlassCard>

      <div className="review-page-grid review-page-grid--balanced">
        <GlassCard className="review-chart-card">
          <h3 className="review-card-title">Détail des canaux</h3>
          <div className="review-table-wrap">
            <table className="review-data-table">
              <thead>
                <tr>
                  <th>Campagne</th>
                  <th>Fermées</th>
                  <th>Signatures</th>
                  <th>Closing</th>
                  <th>CA</th>
                </tr>
              </thead>
              <tbody>
                {detailRows.map((row) => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    <td>{row.closed}</td>
                    <td>{row.won}</td>
                    <td>{fmtPct1(row.closing)}</td>
                    <td>{fmtEur(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>

        <GlassCard className="review-chart-card">
          <h3 className="review-card-title">Concentration clients</h3>
          <p className="review-section-kicker">
            Top {topN} sur {data.concentration.n_total} comptes · CA total,
            renouvellements inclus
          </p>
          <div className="review-table-wrap">
            <table className="review-data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Compte</th>
                  <th>CA total</th>
                  <th>Part</th>
                </tr>
              </thead>
              <tbody>
                {data.concentration.items
                  .slice(0, topN)
                  .map((row) => (
                    <tr key={`${row.rank}-${row.name}`}>
                      <td>{row.rank}</td>
                      <td>{row.name}</td>
                      <td>{fmtEur(row.amount)}</td>
                      <td>{fmtPct1(row.pct / 100)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      </div>
      <p className="review-section-note">{data.sdr_limit}</p>
    </div>
  );
}
