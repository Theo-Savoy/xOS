import { EmptyState, GlassCard, Skeleton } from '../../../components/ui';
import { ConservationBadge } from '../components/ConservationBadge';
import { ScopeTag } from '../components/ScopeTag';
import { StatCard } from '../components/StatCard';
import { fmtEur, fmtPct1 } from '../review.helpers';
import type { CommercialPayload, DgYear } from '../review.types';

function Metric({
  label,
  prev,
  curr,
}: {
  label: string;
  prev: string;
  curr: string;
}) {
  return (
    <div className="review-compare-metric">
      <span className="review-compare-label">{label}</span>
      <span>{prev}</span>
      <span>{curr}</span>
    </div>
  );
}

function pack(row: DgYear | undefined) {
  return {
    detections: row?.detections ?? 0,
    closedNew: row?.closedNew ?? 0,
    signaturesNew: row?.signaturesNew ?? 0,
    closing: row?.closing ?? null,
    ticket: row?.ticket ?? null,
    amountNew: row?.amountNew ?? 0,
    rdv: row?.rdv ?? 0,
  };
}

export function LeadershipSection({
  data,
  loading,
}: {
  data: CommercialPayload | null;
  loading: boolean;
}) {
  if (loading && !data) {
    return (
      <div className="review-section">
        <Skeleton height={200} />
      </div>
    );
  }
  if (!data?.dg) {
    return (
      <EmptyState
        title="Lecture PDG indisponible"
        description="Pas de données PDG sur cette fenêtre."
      />
    );
  }

  const prev = pack(data.dg[data.compare]);
  const curr = pack(data.dg[data.fy]);

  return (
    <div className="review-section">
      <header className="review-section-heading">
        <div>
          <h3 className="review-card-title">
            Jérôme — activité PDG, hors classement commercial{' '}
            <ScopeTag scope="new" />
          </h3>
          <p className="review-section-kicker">
            CA NEW · {data.compare}→{data.fy} · pas d'objectif, pas de
            comparaison sales
          </p>
        </div>
        <ConservationBadge conservation={data.conservation} />
      </header>

      <div className="review-kpi-grid">
        <StatCard
          label={`CA NEW ${data.fy}`}
          value={fmtEur(curr.amountNew)}
          scope="new"
          hint={`${curr.signaturesNew} signatures NEW`}
        />
        <StatCard
          label="RDV"
          value={String(curr.rdv)}
          hint={data.rdv_limit}
        />
        <StatCard
          label="Closing NEW"
          value={fmtPct1(curr.closing)}
          hint={`${curr.signaturesNew} / ${curr.closedNew} fermées`}
        />
      </div>

      <GlassCard className="review-chart-card">
        <div className="review-compare-head">
          <span />
          <span>{data.compare}</span>
          <span>{data.fy}</span>
        </div>
        <Metric
          label="Détections"
          prev={String(prev.detections)}
          curr={String(curr.detections)}
        />
        <Metric
          label="Fermées NEW"
          prev={String(prev.closedNew)}
          curr={String(curr.closedNew)}
        />
        <Metric
          label="Signatures NEW"
          prev={String(prev.signaturesNew)}
          curr={String(curr.signaturesNew)}
        />
        <Metric
          label="Closing NEW"
          prev={fmtPct1(prev.closing)}
          curr={fmtPct1(curr.closing)}
        />
        <Metric
          label="Ticket NEW"
          prev={prev.ticket ? fmtEur(prev.ticket) : '—'}
          curr={curr.ticket ? fmtEur(curr.ticket) : '—'}
        />
        <Metric
          label="CA NEW"
          prev={fmtEur(prev.amountNew)}
          curr={fmtEur(curr.amountNew)}
        />
        <p className="review-section-note">
          Identifié par le mode de suivi PDG, pas par le nom. Inclus dans les
          totaux entreprise, exclu du classement sales et du dénominateur ETP.{' '}
          {data.attribution_limit}
        </p>
      </GlassCard>
    </div>
  );
}
