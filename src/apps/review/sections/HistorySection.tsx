import { EmptyState, GlassCard, Skeleton } from '../../../components/ui';
import { ScopeTag } from '../components/ScopeTag';
import { fmtEur, fmtPct1 } from '../review.helpers';
import { ANNUAL_ONLY_FY, FY_OPTIONS, seriesLabel, seriesSpanLabel } from '../review.period';
import type { OverviewPayload } from '../review.types';

export function HistorySection({
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
        title="Historique indisponible"
        description={`Aucune série sur la fenêtre ${seriesSpanLabel(FY_OPTIONS[0].value, data?.fy || ANNUAL_ONLY_FY, data?.period)}.`}
      />
    );
  }

  return (
    <div className="review-section">
      <header className="review-section-heading">
        <div>
          <h3 className="review-card-title">
            Série
          </h3>
          <ScopeTag scope="total" />
          <p className="review-section-kicker">
            CA total = nouvelles affaires + renouvellements · détections,
            opportunités fermées et signatures nouvelles affaires
            {data.period?.granularity === 'semester'
              ? ` · chaque ligne est une demi-année ${data.period.semester}`
              : ''}
          </p>
        </div>
      </header>
      <GlassCard className="review-chart-card">
        <table className="review-data-table review-data-table--wide">
          <thead>
            <tr>
              <th>FY</th>
              <th>CA total</th>
              <th>CA nouvelles affaires</th>
              <th>CA renouvellements</th>
              <th>Détections nouvelles affaires</th>
              <th>Fermées nouvelles affaires</th>
              <th>Signatures nouvelles affaires</th>
              <th>Closing nouvelles affaires</th>
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
                <td>{seriesLabel(row.fy, data.period)}</td>
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
