import { EmptyState, GlassCard, Skeleton } from '../../../components/ui';
import { ScopeTag } from '../components/ScopeTag';
import {
  WaterfallChart,
  type WaterfallStep,
} from '../components/WaterfallChart';
import { seriesLabel } from '../review.period';
import type { BridgePayload, CatalogueBridge } from '../review.types';

function renewSources(data: BridgePayload): CatalogueBridge[] {
  if (data.by_product) return Object.values(data.by_product);
  return data.catalogue ? [data.catalogue] : [];
}

function sum(rows: number[]): number {
  return rows.reduce((acc, value) => acc + value, 0);
}

/** Waterfall du CA total : renouvellements puis volume et ticket nouvelles affaires. */
export function TotalBridgeSection({
  data,
  loading,
}: {
  data: BridgePayload | null;
  loading: boolean;
}) {
  if (loading && !data) {
    return (
      <div className="review-section">
        <Skeleton height={280} />
      </div>
    );
  }
  const sources = data ? renewSources(data) : [];
  if (!data?.volume_ticket || !sources.length) {
    return (
      <EmptyState
        title="Écart CA total indisponible"
        description="Le détail des renouvellements n'est pas exposé sur cette fenêtre."
      />
    );
  }

  const vt = data.volume_ticket;
  const prevRenew = sum(sources.map((row) => row.prev.renew.amount));
  const currRenew = sum(sources.map((row) => row.curr.renew.amount));
  const renew = currRenew - prevRenew;
  const compareLabel = seriesLabel(data.compare, data.period);
  const fyLabel = seriesLabel(data.fy, data.period);

  const steps: WaterfallStep[] = [
    {
      name: compareLabel,
      amount: vt.prev.amount + prevRenew,
      kind: 'total',
    },
    {
      name: 'Delta renew',
      amount: renew,
      kind: renew >= 0 ? 'up' : 'down',
    },
    {
      name: 'Volume new',
      amount: vt.volume,
      kind: vt.volume >= 0 ? 'up' : 'down',
    },
    {
      name: 'Ticket new',
      amount: vt.ticket,
      kind: vt.ticket >= 0 ? 'up' : 'down',
    },
    {
      name: fyLabel,
      amount: vt.curr.amount + currRenew,
      kind: 'total',
    },
  ];

  return (
    <div className="review-section">
      <header className="review-section-heading">
        <div>
          <h3 className="review-card-title">Écart CA total</h3>
          <ScopeTag scope="total" />
        </div>
      </header>

      <GlassCard className="review-chart-card">
        <h4 className="review-card-title">
          Waterfall CA total {compareLabel} → {fyLabel}
        </h4>
        <WaterfallChart
          steps={steps}
          scope="total"
          source="Salesforce · CA total"
        />
        <p className="review-section-note">
          Trois marches entre {compareLabel} et {fyLabel} : renouvellements,
          volume et ticket nouvelles affaires.
        </p>
      </GlassCard>
    </div>
  );
}
