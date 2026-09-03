import { EmptyState, GlassCard, Skeleton } from '../../../components/ui';
import { ScopeTag } from '../components/ScopeTag';
import { fmtPct1 } from '../review.helpers';
import type { MarketPayload, ReasonTable } from '../review.types';

function ReasonsTable({
  title,
  scope,
  table,
  unit,
}: {
  title: string;
  scope: 'new' | 'signatures-new';
  table: ReasonTable;
  unit: string;
}) {
  const truncated = table.truncated ?? table.n_displayed < table.n_total;
  return (
    <GlassCard className="review-chart-card">
      <h3 className="review-card-title">
        {title} <ScopeTag scope={scope} />
      </h3>
      <p className="review-section-kicker">
        {truncated
          ? `${table.n_displayed} premiers sur ${table.n_total} ${unit}`
          : `${table.n_total} ${unit}`}
        {' · % calculés sur n_total, pas sur les lignes affichées'}
      </p>
      <table className="review-data-table">
        <thead>
          <tr>
            <th>Motif</th>
            <th>n</th>
            <th>%</th>
          </tr>
        </thead>
        <tbody>
          {table.items.map((row) => (
            <tr key={row.label}>
              <td>{row.label}</td>
              <td>{row.count}</td>
              <td>{fmtPct1(row.pct / 100)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </GlassCard>
  );
}

export function ReasonsSection({
  data,
  loading,
}: {
  data: MarketPayload | null;
  loading: boolean;
}) {
  if (loading && !data) {
    return (
      <div className="review-section">
        <Skeleton height={200} />
      </div>
    );
  }
  if (!data?.loss_reasons || !data?.win_reasons) {
    return (
      <EmptyState
        title="Motifs indisponibles"
        description="Pas de motifs de perte ou de gain NEW."
      />
    );
  }

  return (
    <div className="review-section">
      <header className="review-section-heading">
        <div>
          <h3 className="review-card-title">
            Motifs déclaratifs <ScopeTag scope="new" />
          </h3>
          <p className="review-section-kicker">
            Pertes et gains NEW · {data.fy} · motifs déclarés, pas de causalité
          </p>
        </div>
      </header>

      <ReasonsTable
        title="Motifs de perte"
        scope="new"
        table={data.loss_reasons}
        unit="pertes NEW"
      />
      <ReasonsTable
        title="Motifs de gain"
        scope="signatures-new"
        table={data.win_reasons}
        unit="signatures NEW"
      />
    </div>
  );
}
