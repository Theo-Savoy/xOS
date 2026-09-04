import { EmptyState, GlassCard, Skeleton, Tag } from '../../../components/ui';
import { ScopeTag } from '../components/ScopeTag';
import { StatCard } from '../components/StatCard';
import { fmtEur, fmtPct1 } from '../review.helpers';
import type { PortfolioPayload, PortfolioStatus } from '../review.types';

type StatusKey = 'gagnes' | 'fidelises' | 'engages' | 'perdus';

/**
 * Deux univers distincts, jamais additionnés : les comptes signataires de
 * l'exercice et le portefeuille hérité des exercices précédents.
 */
const GROUPS: {
  title: string;
  caption: string;
  unit: string;
  rows: { key: StatusKey; label: string }[];
}[] = [
  {
    title: "Signé pendant l'exercice",
    caption: 'Comptes qui ont signé pendant l’exercice · CA signé.',
    unit: 'CA signé',
    rows: [
      { key: 'gagnes', label: 'Nouveaux clients' },
      { key: 'fidelises', label: 'Clients fidélisés' },
    ],
  },
  {
    title: 'Portefeuille hérité',
    caption: 'Comptes clients avant l’exercice · ARR en cours.',
    unit: 'ARR',
    rows: [
      { key: 'engages', label: 'Toujours clients' },
      { key: 'perdus', label: 'Perdus' },
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
        description="Aucun statut de portefeuille sur cette fenêtre."
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
            Deux lectures distinctes : les comptes qui ont signé pendant
            l&apos;exercice, et le portefeuille hérité des exercices précédents.
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
          Portefeuille hérité : retenus ou perdus
        </h3>
        <p className="review-section-kicker">
          {data.cohort.n_accounts} comptes clients avant l&apos;exercice, pour{' '}
          {fmtEur(data.cohort.arr)} d&apos;ARR.
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
          Contrôle : Nouveaux clients + Clients fidélisés = CA total signé de
          l&apos;exercice.{' '}
          {data.conservation.ok ? (
            <Tag variant="success">OK</Tag>
          ) : (
            <Tag variant="alert">écart</Tag>
          )}
          {lostShare === null
            ? null
            : ` Part du portefeuille hérité perdue : ${fmtPct1(lostShare)}.`}
        </p>
      </GlassCard>
    </div>
  );
}
