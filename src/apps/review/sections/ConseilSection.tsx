import { EmptyState, GlassCard, Skeleton } from '../../../components/ui';
import { ConservationBadge } from '../components/ConservationBadge';
import { ScopeTag } from '../components/ScopeTag';
import { StatCard } from '../components/StatCard';
import { fmtEur, fmtPct1 } from '../review.helpers';
import type { ProductPayload } from '../review.types';

export function ConseilSection({
  data,
  loading,
}: {
  data: ProductPayload | null;
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
  if (!data?.series?.length) {
    return (
      <EmptyState
        title="Aucun conseil"
        description="Pas de ventes Conseil sur la fenêtre FY22→FY26."
      />
    );
  }

  const current =
    data.series.find((row) => row.fy === data.fy) || data.series.at(-1);
  const conseil = current?.products.conseil;

  return (
    <div className="review-section">
      <header className="review-section-heading">
        <div>
          <h3 className="review-card-title">
            Conseil : 8 signatures, pas 3 <ScopeTag scope="total" />
          </h3>
          <p className="review-section-kicker">
            CA total Conseil · NEW + RENEW · {data.fy}
          </p>
        </div>
        <ConservationBadge conservation={data.conservation} />
      </header>

      <div className="review-kpi-grid">
        <StatCard
          label="Signatures totales"
          value={String(conseil?.total_signatures ?? 0)}
          hint={`${conseil?.new ?? 0} NEW · ${conseil?.renew ?? 0} RENEW`}
        />
        <StatCard
          label="CA total"
          value={fmtEur(conseil?.amount_total ?? 0)}
          scope="total"
        />
        <StatCard
          label="CA NEW"
          value={fmtEur(conseil?.amountNew ?? 0)}
          scope="new"
          hint={`${conseil?.new ?? 0} signatures NEW`}
        />
        <StatCard
          label="Closing NEW"
          value={fmtPct1(conseil?.closing)}
          scope="signatures-new"
          hint={`${conseil?.won ?? 0} / ${conseil?.closed ?? 0} fermées`}
        />
      </div>

      <GlassCard className="review-chart-card">
        <h3 className="review-card-title">Conseil FY22→{data.fy}</h3>
        <table className="review-data-table review-data-table--wide">
          <thead>
            <tr>
              <th>Exercice</th>
              <th>CA total</th>
              <th>CA NEW</th>
              <th>CA RENEW</th>
              <th>Sign. NEW</th>
              <th>Sign. RENEW</th>
              <th>Total sign.</th>
            </tr>
          </thead>
          <tbody>
            {data.series.map((row) => {
              const c = row.products.conseil;
              return (
                <tr
                  key={row.fy}
                  className={row.fy === data.fy ? 'review-data-table__current' : ''}
                >
                  <td>{row.fy}</td>
                  <td>{fmtEur(c.amount_total)}</td>
                  <td>{fmtEur(c.amountNew)}</td>
                  <td>{fmtEur(c.amountRenew)}</td>
                  <td>{c.new}</td>
                  <td>{c.renew}</td>
                  <td>{c.total_signatures}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="review-section-note">
          {data.fy} = {conseil?.total_signatures ?? 0} ventes · {conseil?.new ?? 0}{' '}
          NEW · {conseil?.renew ?? 0} RENEW. Ne jamais lire «{' '}
          {conseil?.new ?? 0} signatures » sans qualifier NEW.
        </p>
      </GlassCard>
    </div>
  );
}
