import { EmptyState, GlassCard, Skeleton } from '../../../components/ui';
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

  return (
    <div className="review-section">
      <header className="review-section-heading">
        <div>
          <h3 className="review-card-title">
            Acquisition et concentration <ScopeTag scope="new" />
          </h3>
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
          hint="CA total, RENEW inclus"
        />
        <StatCard
          label="Top 5"
          value={fmtPct1(data.concentration.top5_pct / 100)}
          scope="total"
          hint={`${data.concentration.n_displayed} / ${data.concentration.n_total} comptes`}
        />
      </div>

      <div className="review-page-grid review-page-grid--balanced">
        <GlassCard className="review-chart-card">
          <h3 className="review-card-title">
            Canaux NEW <ScopeTag scope="new" />
          </h3>
          <div className="review-table-wrap">
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
                {data.channels.items.map((row) => (
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
          <h3 className="review-card-title">
            Concentration clients <ScopeTag scope="total" />
          </h3>
          <p className="review-section-kicker">
            Top {data.concentration.n_displayed} sur{' '}
            {data.concentration.n_total} comptes · CA total, RENEW inclus
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
                  .slice(0, data.concentration.n_displayed)
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
