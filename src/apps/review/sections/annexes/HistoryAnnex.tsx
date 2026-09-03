import { EmptyState, GlassCard, Skeleton } from '../../../../components/ui';
import { ConservationBadge } from '../../components/ConservationBadge';
import { ScopeTag } from '../../components/ScopeTag';
import { fmtEur, fmtPct1 } from '../../review.helpers';
import type { OverviewPayload } from '../../review.types';

export function HistoryAnnex({
  data,
  loading,
}: {
  data: OverviewPayload | null;
  loading: boolean;
}) {
  if (loading && !data) {
    return (
      <div className="review-section">
        <Skeleton height={220} />
      </div>
    );
  }
  if (!data?.series?.length) {
    return (
      <EmptyState
        title="Annexe A4"
        description="Pas de série FY22→FY26."
      />
    );
  }

  return (
    <div className="review-section">
      <header className="review-section-heading">
        <div>
          <h3 className="review-card-title">
            A4 · Historique FY22→FY26 <ScopeTag scope="total" />
          </h3>
          <p className="review-section-kicker">
            CA total = NEW + RENEW · détections, fermées et signatures NEW
          </p>
        </div>
        <ConservationBadge conservation={data.conservation} />
      </header>
      <GlassCard className="review-chart-card">
        <table className="review-data-table">
          <thead>
            <tr>
              <th>FY</th>
              <th>CA total</th>
              <th>CA NEW</th>
              <th>CA RENEW</th>
              <th>Détect. NEW</th>
              <th>Fermées NEW</th>
              <th>Sign. NEW</th>
              <th>Closing NEW</th>
            </tr>
          </thead>
          <tbody>
            {data.series.map((row) => (
              <tr
                key={row.fy}
                className={
                  row.fy === data.fy ? 'review-data-table__current' : undefined
                }
              >
                <td>{row.fy}</td>
                <td>{fmtEur(row.total)}</td>
                <td>{fmtEur(row.new)}</td>
                <td>{fmtEur(row.renew)}</td>
                <td>{row.detections_new}</td>
                <td>{row.closed_new}</td>
                <td>{row.signatures_new}</td>
                <td>{fmtPct1(row.closing_new)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </GlassCard>
    </div>
  );
}
