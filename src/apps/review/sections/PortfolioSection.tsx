import { EmptyState, GlassCard, Skeleton, Tag } from '../../../components/ui';
import { ConservationBadge } from '../components/ConservationBadge';
import { ScopeTag } from '../components/ScopeTag';
import { StatCard } from '../components/StatCard';
import { fmtEur, fmtPct1 } from '../review.helpers';
import type { PortfolioPayload, PortfolioStatus } from '../review.types';

const ORDER: (keyof PortfolioPayload['statuses'])[] = [
  'gagnes',
  'fidelises',
  'engages',
  'perdus',
];

function statusHint(row: PortfolioStatus) {
  return row.kind === 'flux'
    ? `${row.count} comptes · CA signé (flux)`
    : `${row.count} comptes · ARR (stock)`;
}

export function PortfolioSection({
  data,
  loading,
}: {
  data: PortfolioPayload | null;
  loading: boolean;
}) {
  if (loading && !data) {
    return (
      <div className="review-section">
        <Skeleton height={120} />
        <Skeleton height={160} />
      </div>
    );
  }
  if (!data?.statuses || !data.cohort) {
    return (
      <EmptyState
        title="Aucun portefeuille"
        description="Pas de statuts ni de cohorte catalogue sur cette fenêtre."
      />
    );
  }

  const retainedPct = data.cohort.retained.pct / 100;
  const lostPct = data.cohort.lost.pct / 100;

  return (
    <div className="review-section">
      <header className="review-section-heading">
        <div>
          <h3 className="review-card-title">
            Quatre statuts exclusifs au 30/06 <ScopeTag scope="total" />
          </h3>
          <p className="review-section-kicker">
            {data.statuses.n_accounts} comptes · Gagnés et Fidélisés = CA signé
            · Engagés et Perdus = ARR
          </p>
        </div>
        <ConservationBadge conservation={data.conservation} />
      </header>

      <div className="review-kpi-grid">
        {ORDER.map((key) => {
          const row = data.statuses[key];
          if (typeof row === 'number') return null;
          return (
            <StatCard
              key={row.key}
              label={row.label}
              value={fmtEur(row.amount)}
              scope={row.kind === 'flux' ? 'total' : undefined}
              hint={statusHint(row)}
            />
          );
        })}
      </div>

      <GlassCard className="review-chart-card">
        <h3 className="review-card-title">
          Cohorte d&apos;ouverture catalogue
        </h3>
        <p className="review-section-kicker">
          {data.cohort.n_accounts} comptes · {fmtEur(data.cohort.arr)} ARR ·
          univers distinct des 4 statuts, jamais sommé
        </p>
        <div className="review-split-bar" aria-hidden="true">
          <span
            className="review-split-bar__renew"
            style={{ width: `${Math.max(retainedPct * 100, 0)}%` }}
          />
          <span
            className="review-split-bar__new"
            style={{ width: `${Math.max(lostPct * 100, 0)}%` }}
          />
        </div>
        <div className="review-split-legend">
          <span>
            Retenus {data.cohort.retained.count} · {fmtPct1(retainedPct)}
          </span>
          <span>
            Perdus {data.cohort.lost.count} · {fmtPct1(lostPct)}
          </span>
        </div>
        <p className="review-section-note">
          Conservations : Gagnés + Fidélisés = CA total FY · Perdus / ARR
          d&apos;ouverture = part du stock perdu. {data.conservation.ok ? (
            <Tag variant="success">OK</Tag>
          ) : (
            <Tag variant="alert">écart</Tag>
          )}
        </p>
      </GlassCard>
    </div>
  );
}
