import { EmptyState, GlassCard, Skeleton } from '../../../components/ui';
import { ConservationBadge } from '../components/ConservationBadge';
import { ScopeTag } from '../components/ScopeTag';
import { StatCard } from '../components/StatCard';
import { fmtEur, fmtNum, fmtPctDelta } from '../review.helpers';
import { productivityOf, type CommercialPayload } from '../review.types';

export function ProductivitySection({
  data,
  loading,
}: {
  data: CommercialPayload | null;
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
  const current = data ? productivityOf(data, data.fy) : undefined;
  const previous = data ? productivityOf(data, data.compare) : undefined;
  if (!data || !current || !previous) {
    return (
      <EmptyState
        title="Aucune productivité"
        description="Les ETP sales (hors PDG, hors SDR) manquent pour cet exercice."
      />
    );
  }

  const evo = data.productivity.evolution;
  const rows = [previous, current];

  return (
    <div className="review-section">
      <header className="review-section-heading">
        <div>
          <h3 className="review-card-title">
            Moins d'ETP, plus de production par personne{' '}
            <ScopeTag scope="new" />
          </h3>
          <p className="review-section-kicker">
            Production sales hors Jérôme, hors SDR · {data.compare}→{data.fy}
          </p>
        </div>
        <ConservationBadge conservation={data.conservation} />
      </header>

      <div className="review-kpi-grid">
        <StatCard
          label="CA NEW / ETP"
          value={fmtEur(current.caPerFte || 0)}
          scope="new"
          delta={fmtPctDelta(evo.caPerFte)}
        />
        <StatCard
          label="Signatures / ETP"
          value={fmtNum(current.signaturesPerFte, 1)}
          scope="signatures-new"
          delta={fmtPctDelta(evo.signaturesPerFte)}
        />
        <StatCard
          label="Détections / ETP"
          value={fmtNum(current.detectionsPerFte, 1)}
          delta={fmtPctDelta(evo.detectionsPerFte)}
        />
      </div>

      <GlassCard className="review-chart-card">
        <h3 className="review-card-title">Capacité et ratios</h3>
        <table className="review-data-table">
          <thead>
            <tr>
              <th>Exercice</th>
              <th>ETP sales</th>
              <th>CA NEW sales</th>
              <th>Signatures NEW</th>
              <th>Détections</th>
              <th>CA / ETP</th>
              <th>Sign. / ETP</th>
              <th>Dét. / ETP</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.fy}
                className={
                  row.fy === data.fy ? 'review-data-table__current' : undefined
                }
              >
                <td>{row.fy}</td>
                <td>{fmtNum(row.fte, 2)}</td>
                <td>{fmtEur(row.amountNew)}</td>
                <td>{row.signatures}</td>
                <td>{row.detections}</td>
                <td>{fmtEur(row.caPerFte || 0)}</td>
                <td>{fmtNum(row.signaturesPerFte, 1)}</td>
                <td>{fmtNum(row.detectionsPerFte, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="review-section-note">
          ETP fournis par la direction, non dérivés de Salesforce. Jérôme est
          hors dénominateur. {data.attribution_limit}
        </p>
      </GlassCard>
    </div>
  );
}
