import { EmptyState, GlassCard, Skeleton } from '../../../components/ui';
import { ScopeTag } from '../components/ScopeTag';
import { StatCard } from '../components/StatCard';
import { fmtEur, fmtPct1 } from '../review.helpers';
import { seriesLabel } from '../review.period';
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
        title="Aucune activité PDG"
        description="Aucune donnée PDG sur cette fenêtre."
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
            PDG
          </h3>
          <ScopeTag scope="new" />
          <p className="review-section-kicker">
            CA nouv. aff. · {seriesLabel(data.compare, data.period)}→
            {seriesLabel(data.fy, data.period)} · pas d'objectif, pas de
            comparaison sales
          </p>
        </div>
      </header>

      <div className="review-kpi-grid">
        <StatCard
          label={`CA nouv. aff. ${seriesLabel(data.fy, data.period)}`}
          value={fmtEur(curr.amountNew)}
          scope="new"
          hint={`${curr.signaturesNew} signatures nouv. aff.`}
        />
        <StatCard label="RDV" value={String(curr.rdv)} hint={data.rdv_limit} />
        <StatCard
          label="Closing nouv. aff."
          value={fmtPct1(curr.closing)}
          hint={`${curr.signaturesNew} / ${curr.closedNew} fermées`}
        />
      </div>

      <GlassCard className="review-chart-card">
        <div className="review-compare-head">
          <span />
          <span>{seriesLabel(data.compare, data.period)}</span>
          <span>{seriesLabel(data.fy, data.period)}</span>
        </div>
        <Metric
          label="Détections"
          prev={String(prev.detections)}
          curr={String(curr.detections)}
        />
        <Metric
          label="Fermées nouv. aff."
          prev={String(prev.closedNew)}
          curr={String(curr.closedNew)}
        />
        <Metric
          label="Signatures nouv. aff."
          prev={String(prev.signaturesNew)}
          curr={String(curr.signaturesNew)}
        />
        <Metric
          label="Closing nouv. aff."
          prev={fmtPct1(prev.closing)}
          curr={fmtPct1(curr.closing)}
        />
        <Metric
          label="Ticket nouv. aff."
          prev={prev.ticket ? fmtEur(prev.ticket) : '—'}
          curr={curr.ticket ? fmtEur(curr.ticket) : '—'}
        />
        <Metric
          label="CA nouv. aff."
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
