import { useState } from 'react';
import { Button, EmptyState, GlassCard, Skeleton } from '../../../components/ui';
import { ScopeTag } from '../components/ScopeTag';
import { StatCard } from '../components/StatCard';
import {
  WaterfallChart,
  type WaterfallStep,
} from '../components/WaterfallChart';
import { fmtEur, fmtPct1 } from '../review.helpers';
import { seriesLabel } from '../review.period';
import type { BridgePayload, ProductBridgeKey } from '../review.types';

const PRODUCTS: { key: ProductBridgeKey; label: string }[] = [
  { key: 'catalogue', label: 'Catalogue' },
  { key: 'sur_mesure', label: 'Sur-mesure' },
  { key: 'conseil', label: 'Conseil' },
];

export function CatalogueBridgeSection({
  data,
  loading,
}: {
  data: BridgePayload | null;
  loading: boolean;
}) {
  const [product, setProduct] = useState<ProductBridgeKey>('catalogue');

  if (loading && !data) {
    return (
      <div className="review-section">
        <Skeleton height={120} />
        <Skeleton height={280} />
      </div>
    );
  }
  if (!data) {
    return (
      <EmptyState
        title="Aucun bridge"
        description="Pas de comparaison sur cette fenêtre."
      />
    );
  }

  const cat =
    data.by_product?.[product] ??
    (product === 'catalogue' ? data.catalogue : undefined);
  const currentProdMeta =
    PRODUCTS.find((p) => p.key === product) || PRODUCTS[0];

  if (!cat) {
    return (
      <EmptyState
        title={`Aucun bridge ${currentProdMeta.label.toLowerCase()}`}
        description="Pas de comparaison sur cette fenêtre."
      />
    );
  }

  const prevTotal = cat.prev.new.amount + cat.prev.renew.amount;
  const currTotal = cat.curr.new.amount + cat.curr.renew.amount;
  const steps: WaterfallStep[] = [
    {
      name: seriesLabel(data.compare, data.period),
      amount: prevTotal,
      kind: 'total',
    },
    {
      name: 'Delta renew',
      amount: cat.renew,
      kind: cat.renew >= 0 ? 'up' : 'down',
    },
    {
      name: 'Volume new',
      amount: cat.volume,
      kind: cat.volume >= 0 ? 'up' : 'down',
    },
    {
      name: 'Ticket new',
      amount: cat.ticket,
      kind: cat.ticket >= 0 ? 'up' : 'down',
    },
    {
      name: seriesLabel(data.fy, data.period),
      amount: currTotal,
      kind: 'total',
    },
  ];

  return (
    <div className="review-section">
      <header className="review-section-heading">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: 'var(--xos-space-2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--xos-space-2)' }}>
            <h3 className="review-card-title">
              Écart {currentProdMeta.label.toLowerCase()}
            </h3>
            <ScopeTag scope="total" />
          </div>
          <div className="review-period-selector" role="tablist" aria-label="Sélection du produit">
            {PRODUCTS.map((p) => (
              <Button
                key={p.key}
                type="button"
                variant="ghost"
                size="sm"
                role="tab"
                aria-selected={product === p.key}
                className={product === p.key ? 'review-period-button--active' : ''}
                onClick={() => setProduct(p.key)}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>
      </header>

      <div className="review-kpi-grid">
        <StatCard
          label="Delta renouvellements"
          value={fmtEur(cat.renew)}
          hint={fmtPct1(cat.share_renew)}
        />
        <StatCard
          label="Volume nouvelles affaires"
          value={fmtEur(cat.volume)}
          scope="new"
        />
        <StatCard
          label="Ticket nouvelles affaires"
          value={fmtEur(cat.ticket)}
          scope="new"
        />
        <StatCard label="Total" value={fmtEur(cat.total)} scope="total" />
      </div>

      <GlassCard className="review-chart-card">
        <h3 className="review-card-title">
          Waterfall {currentProdMeta.label.toLowerCase()} {seriesLabel(data.compare, data.period)} →{' '}
          {seriesLabel(data.fy, data.period)}
        </h3>
        <WaterfallChart
          steps={steps}
          scope="total"
          source={`Salesforce · CA total ${currentProdMeta.label.toLowerCase()}`}
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
          <span>{fmtPct1(cat.share_renew)} renouvellements</span>
          <span>{fmtPct1(cat.share_new)} nouvelles affaires</span>
        </p>
        <p className="review-section-note">
          Stock ARR et flux signé : deux lectures distinctes, à ne pas additionner.
        </p>
      </GlassCard>
    </div>
  );
}
