import { EmptyState, GlassCard, Skeleton } from '../../../../components/ui';
import { ConservationBadge } from '../../components/ConservationBadge';
import { ScopeTag } from '../../components/ScopeTag';
import { fmtEur, fmtPct1 } from '../../review.helpers';
import type { ChannelsPayload } from '../../review.types';

export function CampaignsAnnex({
  data,
  loading,
}: {
  data: ChannelsPayload | null;
  loading: boolean;
}) {
  if (loading && !data) {
    return (
      <div className="review-section">
        <Skeleton height={240} />
      </div>
    );
  }
  if (!data?.channels || !data.concentration) {
    return (
      <EmptyState
        title="Annexe A7"
        description="Pas de campagnes ni de concentration."
      />
    );
  }

  return (
    <div className="review-section">
      <header className="review-section-heading">
        <div>
          <h3 className="review-card-title">
            A7 · Campagnes complètes <ScopeTag scope="new" />
          </h3>
          <p className="review-section-kicker">
            {data.channels.n_total} canaux · concentration sur CA total RENEW
            inclus
          </p>
        </div>
        <ConservationBadge conservation={data.conservation} />
      </header>

      <GlassCard className="review-chart-card">
        <h3 className="review-card-title">Canaux NEW</h3>
        <table className="review-data-table">
          <thead>
            <tr>
              <th>Campagne</th>
              <th>Fermées</th>
              <th>Sign.</th>
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
      </GlassCard>

      <GlassCard className="review-chart-card">
        <h3 className="review-card-title">
          Concentration <ScopeTag scope="total" />
        </h3>
        <p className="review-section-kicker">
          Top {data.concentration.n_displayed} sur {data.concentration.n_total}{' '}
          comptes · Top 1 {fmtPct1(data.concentration.top1_pct / 100)} · Top 5{' '}
          {fmtPct1(data.concentration.top5_pct / 100)}
        </p>
        <table className="review-data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Compte</th>
              <th>CA</th>
              <th>%</th>
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
        <p className="review-section-note">{data.sdr_limit}</p>
      </GlassCard>
    </div>
  );
}
