import { EmptyState, GlassCard, Skeleton } from '../../../components/ui';
import { ConservationBadge } from '../components/ConservationBadge';
import { ScopeTag } from '../components/ScopeTag';
import { StatCard } from '../components/StatCard';
import { fmtEur, fmtPct1 } from '../review.helpers';
import type { ChannelsPayload } from '../review.types';

export function ChannelsSection({
  data,
  loading,
}: {
  data: ChannelsPayload | null;
  loading: boolean;
}) {
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
        title="Aucun canal"
        description="Pas de campagnes NEW sur cette fenêtre."
      />
    );
  }

  const rows = data.channels.items.slice(0, data.channels.n_displayed);

  return (
    <div className="review-section">
      <header className="review-section-heading">
        <div>
          <h3 className="review-card-title">
            Canaux NEW, hors RENEW <ScopeTag scope="new" />
          </h3>
          <p className="review-section-kicker">
            {data.channels.n_displayed} premiers sur {data.channels.n_total}{' '}
            canaux · % et totaux calculés sur n_total
          </p>
        </div>
        <ConservationBadge conservation={data.conservation} />
      </header>

      <div className="review-kpi-grid">
        <StatCard
          label="Top 1"
          value={fmtPct1(data.concentration.top1_pct / 100)}
          scope="total"
          hint="CA total, RENEW inclus"
        />
        <StatCard
          label="Top 5"
          value={fmtPct1(data.concentration.top5_pct / 100)}
          scope="total"
          hint={`${data.concentration.n_displayed} / ${data.concentration.n_total} comptes`}
        />
      </div>

      <GlassCard className="review-chart-card">
        <table className="review-data-table">
          <thead>
            <tr>
              <th>Campagne</th>
              <th>Fermées NEW</th>
              <th>Sign. NEW</th>
              <th>Closing</th>
              <th>CA NEW</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
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
        <p className="review-section-note">{data.sdr_limit}</p>
      </GlassCard>
    </div>
  );
}
