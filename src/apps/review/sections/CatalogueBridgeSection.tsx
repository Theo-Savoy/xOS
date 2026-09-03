import { EmptyState, GlassCard, Skeleton } from '../../../components/ui';
import { ConservationBadge } from '../components/ConservationBadge';
import { ScopeTag } from '../components/ScopeTag';
import { StatCard } from '../components/StatCard';
import { WaterfallChart, type WaterfallStep } from '../components/WaterfallChart';
import { fmtEur, fmtPct1 } from '../review.helpers';
import type { BridgePayload } from '../review.types';

export function CatalogueBridgeSection({
  data,
  loading,
}: {
  data: BridgePayload | null;
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
  if (!data?.catalogue) {
    return (
      <EmptyState
        title="Aucun bridge catalogue"
        description="Sélectionnez deux exercices pour décomposer le recul catalogue."
      />
    );
  }

  const cat = data.catalogue;
  const prevTotal = cat.prev.new.amount + cat.prev.renew.amount;
  const currTotal = cat.curr.new.amount + cat.curr.renew.amount;
  const steps: WaterfallStep[] = [
    { name: data.compare, amount: prevTotal, kind: 'total' },
    { name: 'RENEW', amount: cat.renew, kind: cat.renew >= 0 ? 'up' : 'down' },
    {
      name: 'Volume NEW',
      amount: cat.volume,
      kind: cat.volume >= 0 ? 'up' : 'down',
    },
    {
      name: 'Ticket NEW',
      amount: cat.ticket,
      kind: cat.ticket >= 0 ? 'up' : 'down',
    },
    { name: data.fy, amount: currTotal, kind: 'total' },
  ];

  return (
    <div className="review-section">
      <header className="review-section-heading">
        <div>
          <h3 className="review-card-title">
            Le recul catalogue est d'abord un recul RENEW{' '}
            <ScopeTag scope="total" />
          </h3>
          <p className="review-section-kicker">
            CA total catalogue · {data.compare}→{data.fy} · décomposition RENEW
            + volume NEW + ticket NEW
          </p>
        </div>
        <ConservationBadge conservation={data.conservation} />
      </header>

      <div className="review-kpi-grid">
        <StatCard
          label="Delta RENEW"
          value={fmtEur(cat.renew)}
          hint={fmtPct1(cat.share_renew)}
        />
        <StatCard
          label="Volume NEW"
          value={fmtEur(cat.volume)}
          scope="new"
        />
        <StatCard
          label="Ticket NEW"
          value={fmtEur(cat.ticket)}
          scope="new"
        />
        <StatCard label="Total" value={fmtEur(cat.total)} scope="total" />
      </div>

      <GlassCard className="review-chart-card">
        <h3 className="review-card-title">
          Waterfall catalogue {data.compare} → {data.fy}
        </h3>
        <WaterfallChart
          steps={steps}
          scope="total"
          source="Salesforce · CA total catalogue"
        />
        <div className="review-split-bar" aria-hidden="true">
          <span
            className="review-split-bar__renew"
            style={{ width: `${cat.share_renew * 100}%` }}
          />
          <span
            className="review-split-bar__new"
            style={{ width: `${cat.share_new * 100}%` }}
          />
        </div>
        <p className="review-split-legend">
          <span>{fmtPct1(cat.share_renew)} RENEW</span>
          <span>{fmtPct1(cat.share_new)} NEW</span>
        </p>
        <p className="review-section-note">
          Le bridge montre d'où vient l'écart, pas pourquoi il existe. Stock ARR
          et flux signé ne s'additionnent pas.
        </p>
      </GlassCard>
    </div>
  );
}
