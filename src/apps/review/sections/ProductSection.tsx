import { useState } from 'react';
import { Button, EmptyState, GlassCard, Skeleton } from '../../../components/ui';
import { ScopeTag } from '../components/ScopeTag';
import { StatCard } from '../components/StatCard';
import {
  WaterfallChart,
  type WaterfallStep,
} from '../components/WaterfallChart';
import { fmtDays, fmtEur, fmtPct1 } from '../review.helpers';
import { seriesLabel } from '../review.period';
import type {
  BridgePayload,
  ProductBridgeKey,
  ProductPayload,
  ProductRow,
} from '../review.types';

const PRODUCTS: { key: ProductBridgeKey; label: string }[] = [
  { key: 'catalogue', label: 'Catalogue' },
  { key: 'sur_mesure', label: 'Sur-mesure' },
  { key: 'conseil', label: 'Conseil' },
];

function ticketLabel(row: ProductRow | undefined): string {
  return row && row.won > 0 ? fmtEur(row.amountNew / row.won) : '—';
}

function fmtDeltaNumber(curr: number, prev: number): string {
  const d = curr - prev;
  return d > 0 ? `+${d}` : String(d);
}

function fmtDeltaEur(curr: number, prev: number): string {
  const d = curr - prev;
  return d > 0 ? `+${fmtEur(d)}` : fmtEur(d);
}

function fmtDeltaPct(curr: number | null, prev: number | null): string {
  if (curr === null || prev === null) return '—';
  const d = (curr - prev) * 100;
  const str = `${d.toFixed(1)} pt`;
  return d > 0 ? `+${str}` : str;
}

function fmtDeltaDays(curr: number | null, prev: number | null): string {
  if (curr === null || prev === null) return '—';
  const d = Math.round(curr - prev);
  return d > 0 ? `+${d} j` : `${d} j`;
}

/**
 * Lecture produit unifiée : un seul sélecteur pilote le tableau d'indicateurs,
 * l'écart et le waterfall de l'offre choisie.
 */
export function ProductSection({
  product,
  bridge,
  loading,
  compare,
}: {
  product: ProductPayload | null;
  bridge: BridgePayload | null;
  loading: boolean;
  compare: string;
}) {
  const [selected, setSelected] = useState<ProductBridgeKey>('catalogue');

  if (loading && !product && !bridge) {
    return (
      <div className="review-section">
        <Skeleton height={120} />
        <Skeleton height={280} />
      </div>
    );
  }
  if (!product?.series?.length) {
    return (
      <EmptyState
        title="Aucun produit sur la période"
        description="Pas de ventes nouvelles affaires sur cette fenêtre."
      />
    );
  }

  const currYear =
    product.series.find((row) => row.fy === product.fy) || product.series.at(-1);
  const prevYear = product.series.find((row) => row.fy === compare);
  const prev = prevYear?.products[selected];
  const curr = currYear?.products[selected];
  const autre = currYear?.products.autre;
  const meta = PRODUCTS.find((p) => p.key === selected) || PRODUCTS[0];
  const offer = meta.label.toLowerCase();

  const prevTicket = prev && prev.won > 0 ? prev.amountNew / prev.won : 0;
  const currTicket = curr && curr.won > 0 ? curr.amountNew / curr.won : 0;

  const gap =
    bridge?.by_product?.[selected] ??
    (selected === 'catalogue' ? bridge?.catalogue : undefined);
  const gapSteps: WaterfallStep[] = gap
    ? [
        {
          name: seriesLabel(bridge?.compare || compare, bridge?.period),
          amount: gap.prev.new.amount + gap.prev.renew.amount,
          kind: 'total',
        },
        {
          name: 'Renouvellements',
          amount: gap.renew,
          kind: gap.renew >= 0 ? 'up' : 'down',
        },
        {
          name: 'Volume nouvelles affaires',
          amount: gap.volume,
          kind: gap.volume >= 0 ? 'up' : 'down',
        },
        {
          name: 'Ticket nouvelles affaires',
          amount: gap.ticket,
          kind: gap.ticket >= 0 ? 'up' : 'down',
        },
        {
          name: seriesLabel(bridge?.fy || product.fy, bridge?.period),
          amount: gap.curr.new.amount + gap.curr.renew.amount,
          kind: 'total',
        },
      ]
    : [];

  return (
    <div className="review-section">
      <header className="review-section-heading">
        <div>
          <h3 className="review-card-title">Vue globale par produit</h3>
          <ScopeTag scope="total" />
        </div>
        <div
          className="review-period-selector"
          role="tablist"
          aria-label="Sélection du produit"
        >
          {PRODUCTS.map((p) => (
            <Button
              key={p.key}
              type="button"
              variant="ghost"
              size="sm"
              role="tab"
              aria-selected={selected === p.key}
              className={
                selected === p.key ? 'review-period-button--active' : ''
              }
              onClick={() => setSelected(p.key)}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </header>

      <GlassCard className="review-chart-card">
        <h4 className="review-card-title">
          Indicateurs {offer} — {seriesLabel(compare, product.period)} vs{' '}
          {seriesLabel(product.fy, product.period)}
        </h4>
        <div className="review-table-wrap">
          <table className="review-data-table">
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Indicateur</th>
                <th style={{ textAlign: 'right' }}>
                  {seriesLabel(compare, product.period)}
                </th>
                <th style={{ textAlign: 'right' }}>
                  {seriesLabel(product.fy, product.period)}
                </th>
                <th style={{ textAlign: 'right' }}>Écart</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Opportunités fermées nouvelles affaires</td>
                <td style={{ textAlign: 'right' }}>{prev ? prev.closed : '—'}</td>
                <td style={{ textAlign: 'right' }}>{curr ? curr.closed : '—'}</td>
                <td style={{ textAlign: 'right' }}>
                  {prev && curr ? fmtDeltaNumber(curr.closed, prev.closed) : '—'}
                </td>
              </tr>
              <tr>
                <td>Signatures nouvelles affaires</td>
                <td style={{ textAlign: 'right' }}>{prev ? prev.won : '—'}</td>
                <td style={{ textAlign: 'right' }}>{curr ? curr.won : '—'}</td>
                <td style={{ textAlign: 'right' }}>
                  {prev && curr ? fmtDeltaNumber(curr.won, prev.won) : '—'}
                </td>
              </tr>
              <tr>
                <td>Taux de closing</td>
                <td style={{ textAlign: 'right' }}>
                  {prev ? fmtPct1(prev.closing) : '—'}
                </td>
                <td style={{ textAlign: 'right' }}>
                  {curr ? fmtPct1(curr.closing) : '—'}
                </td>
                <td style={{ textAlign: 'right' }}>
                  {prev && curr ? fmtDeltaPct(curr.closing, prev.closing) : '—'}
                </td>
              </tr>
              <tr>
                <td>CA nouvelles affaires</td>
                <td style={{ textAlign: 'right' }}>
                  {prev ? fmtEur(prev.amountNew) : '—'}
                </td>
                <td style={{ textAlign: 'right' }}>
                  {curr ? fmtEur(curr.amountNew) : '—'}
                </td>
                <td style={{ textAlign: 'right' }}>
                  {prev && curr
                    ? fmtDeltaEur(curr.amountNew, prev.amountNew)
                    : '—'}
                </td>
              </tr>
              <tr>
                <td>Ticket moyen</td>
                <td style={{ textAlign: 'right' }}>{ticketLabel(prev)}</td>
                <td style={{ textAlign: 'right' }}>{ticketLabel(curr)}</td>
                <td style={{ textAlign: 'right' }}>
                  {prev && curr && prevTicket > 0 && currTicket > 0
                    ? fmtDeltaEur(currTicket, prevTicket)
                    : '—'}
                </td>
              </tr>
              <tr>
                <td>Cycle médian</td>
                <td style={{ textAlign: 'right' }}>{fmtDays(prev?.median)}</td>
                <td style={{ textAlign: 'right' }}>{fmtDays(curr?.median)}</td>
                <td style={{ textAlign: 'right' }}>
                  {prev && curr ? fmtDeltaDays(curr.median, prev.median) : '—'}
                </td>
              </tr>
              <tr>
                <td>Cycle moyen</td>
                <td style={{ textAlign: 'right' }}>{fmtDays(prev?.mean)}</td>
                <td style={{ textAlign: 'right' }}>{fmtDays(curr?.mean)}</td>
                <td style={{ textAlign: 'right' }}>
                  {prev && curr ? fmtDeltaDays(curr.mean, prev.mean) : '—'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </GlassCard>

      {autre && autre.amountNew > 0 ? (
        <p className="review-section-note">
          {autre.label} : {fmtEur(autre.amountNew)} · {autre.won} signature
          {autre.won > 1 ? 's' : ''} hors des trois offres (LMS, XOS+ ou type
          vide).
        </p>
      ) : null}

      {gap ? (
        <>
          <div className="review-kpi-grid">
            <StatCard
              label="Delta renouvellements"
              value={fmtEur(gap.renew)}
              hint={fmtPct1(gap.share_renew)}
            />
            <StatCard
              label="Volume nouvelles affaires"
              value={fmtEur(gap.volume)}
              scope="new"
            />
            <StatCard
              label="Ticket nouvelles affaires"
              value={fmtEur(gap.ticket)}
              scope="new"
            />
            <StatCard label="Total" value={fmtEur(gap.total)} scope="total" />
          </div>

          <GlassCard className="review-chart-card">
            <h4 className="review-card-title">
              Waterfall {offer}{' '}
              {seriesLabel(bridge?.compare || compare, bridge?.period)} →{' '}
              {seriesLabel(bridge?.fy || product.fy, bridge?.period)}
            </h4>
            <WaterfallChart
              steps={gapSteps}
              scope="total"
              source={`Salesforce · CA total ${offer}`}
            />
            <div className="review-split-bar" aria-hidden="true">
              <span
                className="review-split-bar__renew"
                style={{ width: `${gap.share_renew * 100}%` }}
              />
              <span
                className="review-split-bar__new"
                style={{ width: `${gap.share_new * 100}%` }}
              />
            </div>
            <p className="review-split-legend">
              <span>{fmtPct1(gap.share_renew)} renouvellements</span>
              <span>{fmtPct1(gap.share_new)} nouvelles affaires</span>
            </p>
            <p className="review-section-note">
              Stock ARR et flux signé : deux lectures distinctes, à ne pas
              additionner.
            </p>
          </GlassCard>
        </>
      ) : (
        <p className="review-section-note">
          Écart {offer} indisponible : pas de bridge sur cette fenêtre.
        </p>
      )}
    </div>
  );
}
