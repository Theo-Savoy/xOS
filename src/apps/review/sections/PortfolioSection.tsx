import { EmptyState, GlassCard, Skeleton, Tag } from '../../../components/ui';
import { ScopeTag } from '../components/ScopeTag';
import { StatCard } from '../components/StatCard';
import { fmtEur, fmtPct1 } from '../review.helpers';
import type { PortfolioPayload, PortfolioStatus } from '../review.types';

type StatusKey = 'gagnes' | 'fidelises' | 'engages' | 'perdus';

/**
 * Deux univers distincts, jamais additionnés : le flux signé de l'exercice
 * (lecture par compte) et la cohorte d'ouverture ARR (contrats antérieurs).
 */
const GROUPS: {
  title: string;
  caption: string;
  unit: string;
  rows: { key: StatusKey; label: string }[];
}[] = [
  {
    title: "Flux signé de l'exercice",
    caption:
      "Comptes ayant signé pendant l'exercice, un compte par ligne · CA signé.",
    unit: 'CA signé',
    rows: [
      { key: 'gagnes', label: 'Gagnés (nouveaux comptes)' },
      { key: 'fidelises', label: 'Fidélisés (comptes déjà clients)' },
    ],
  },
  {
    title: "Cohorte d'ouverture (ARR)",
    caption:
      "Comptes sous contrat catalogue ARR ouvert avant l'exercice · stock ARR.",
    unit: 'ARR',
    rows: [
      { key: 'engages', label: "Engagés (cohorte d'ouverture)" },
      { key: 'perdus', label: "Perdus (cohorte d'ouverture)" },
    ],
  },
];

function statusOf(
  data: PortfolioPayload,
  key: StatusKey,
): PortfolioStatus | null {
  const row = data.statuses[key];
  return typeof row === 'number' ? null : row;
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
        title="Aucun portefeuille sur la période"
        description="Aucun statut ni cohorte catalogue sur cette fenêtre."
      />
    );
  }

  const payload = data;
  const retainedPct = data.cohort.retained.pct / 100;
  const lostPct = data.cohort.lost.pct / 100;
  const lostShare = data.conservation.lost_share?.ratio ?? null;

  return (
    <div className="review-section">
      <header className="review-section-heading">
        <div>
          <h3 className="review-card-title">Portefeuille au 30/06</h3>
          <ScopeTag scope="total" />
          <p className="review-section-kicker">
            Deux lectures par compte, à ne pas additionner : le flux signé de
            l&apos;exercice et la cohorte d&apos;ouverture ARR.
          </p>
        </div>
      </header>

      {GROUPS.map((group) => {
        const rows = group.rows
          .map((row) => ({ ...row, status: statusOf(payload, row.key) }))
          .filter((row) => row.status);
        if (!rows.length) return null;
        const accounts = rows.reduce(
          (acc, row) => acc + (row.status?.count ?? 0),
          0,
        );
        return (
          <div key={group.title}>
            <h4 className="review-card-title">{group.title}</h4>
            <p className="review-section-kicker">
              {accounts} comptes · {group.caption}
            </p>
            <div className="review-kpi-grid">
              {rows.map((row) => (
                <StatCard
                  key={row.key}
                  label={row.label}
                  value={fmtEur(row.status?.amount ?? 0)}
                  hint={`${row.status?.count ?? 0} comptes · ${group.unit}`}
                />
              ))}
            </div>
          </div>
        );
      })}

      <GlassCard className="review-chart-card">
        <h3 className="review-card-title">
          Devenir de la cohorte d&apos;ouverture
        </h3>
        <p className="review-section-kicker">
          {data.cohort.n_accounts} comptes · {fmtEur(data.cohort.arr)} ARR. La
          cohorte d&apos;ouverture (contrats ARR antérieurs à l&apos;exercice)
          est un univers séparé des comptes ayant signé pendant l&apos;exercice :
          les deux ne se somment pas.
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
          Contrôle : Gagnés + Fidélisés = CA total signé de l&apos;exercice.{' '}
          {data.conservation.ok ? (
            <Tag variant="success">OK</Tag>
          ) : (
            <Tag variant="alert">écart</Tag>
          )}
          {lostShare === null
            ? null
            : ` Part du stock ARR perdue : ${fmtPct1(lostShare)}.`}
        </p>
      </GlassCard>
    </div>
  );
}
