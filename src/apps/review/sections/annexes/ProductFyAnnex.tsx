import { EmptyState, GlassCard, Skeleton } from '../../../../components/ui';
import { ConservationBadge } from '../../components/ConservationBadge';
import { ScopeTag } from '../../components/ScopeTag';
import { fmtDays, fmtEur, fmtPct1 } from '../../review.helpers';
import type { ProductPayload, ProductRow } from '../../review.types';

const KEYS = ['catalogue', 'sur_mesure', 'conseil', 'autre'] as const;

function rowsFor(data: ProductPayload): {
  fy: string;
  product: ProductRow;
}[] {
  const out: { fy: string; product: ProductRow }[] = [];
  for (const year of data.series) {
    if (!['FY24', 'FY25', 'FY26'].includes(year.fy)) continue;
    for (const key of KEYS) {
      if (key === 'autre' && year.products.autre.amountNew === 0 && year.products.autre.won === 0) {
        continue;
      }
      out.push({ fy: year.fy, product: year.products[key] });
    }
  }
  return out;
}

export function ProductFyAnnex({
  data,
  loading,
}: {
  data: ProductPayload | null;
  loading: boolean;
}) {
  if (loading && !data) {
    return (
      <div className="review-section">
        <Skeleton height={200} />
      </div>
    );
  }
  if (!data?.series?.length) {
    return (
      <EmptyState
        title="Annexe A5"
        description="Pas de série produit × exercice."
      />
    );
  }

  const rows = rowsFor(data);

  return (
    <div className="review-section">
      <header className="review-section-heading">
        <div>
          <h3 className="review-card-title">
            A5 · Produit × exercice <ScopeTag scope="new" />
          </h3>
          <p className="review-section-kicker">
            Fermées NEW, signatures NEW, closing, CA NEW, cycles — FY24→FY26
          </p>
        </div>
        <ConservationBadge conservation={data.conservation} />
      </header>

      <GlassCard className="review-chart-card">
        <table className="review-data-table">
          <thead>
            <tr>
              <th>Produit · FY</th>
              <th>Fermées NEW</th>
              <th>Sign. NEW</th>
              <th>Closing</th>
              <th>CA NEW</th>
              <th>Cycle méd.</th>
              <th>Cycle moy.</th>
              <th>n cycle</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ fy, product }) => (
              <tr key={`${product.key}-${fy}`}>
                <td>
                  {product.label} · {fy}
                </td>
                <td>{product.closed}</td>
                <td>{product.won}</td>
                <td>{fmtPct1(product.closing)}</td>
                <td>{fmtEur(product.amountNew)}</td>
                <td>{fmtDays(product.median)}</td>
                <td>{fmtDays(product.mean)}</td>
                <td>{product.n_cycle}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="review-section-note">
          La ligne « Autre / non défini » absorbe LMS, XOS+ et type vide — sans
          elle le total NEW ne conserve pas.
        </p>
      </GlassCard>
    </div>
  );
}
