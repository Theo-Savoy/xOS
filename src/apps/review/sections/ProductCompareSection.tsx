import { useState } from 'react';
import { Button, EmptyState, GlassCard, Skeleton } from '../../../components/ui';
import { ScopeTag } from '../components/ScopeTag';
import { fmtDays, fmtEur, fmtPct1 } from '../review.helpers';
import { seriesLabel } from '../review.period';
import type { ProductPayload, ProductRow } from '../review.types';

type ProductKey = 'catalogue' | 'sur_mesure' | 'conseil';

const PRODUCTS: { key: ProductKey; label: string }[] = [
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

export function ProductCompareSection({
  data,
  loading,
  compare,
}: {
  data: ProductPayload | null;
  loading: boolean;
  compare: string;
}) {
  const [product, setProduct] = useState<ProductKey>('catalogue');

  if (loading && !data) {
    return (
      <div className="review-section">
        <Skeleton height={120} />
        <Skeleton height={280} />
      </div>
    );
  }
  if (!data?.series?.length) {
    return (
      <EmptyState
        title="Aucun produit"
        description="Pas de ventilation catalogue / sur-mesure sur cette fenêtre."
      />
    );
  }

  const currYear = data.series.find((row) => row.fy === data.fy) || data.series.at(-1);
  const prevYear = data.series.find((row) => row.fy === compare);
  const prev = prevYear?.products[product];
  const curr = currYear?.products[product];
  const autre = currYear?.products.autre;
  const currentProdMeta = PRODUCTS.find((p) => p.key === product) || PRODUCTS[0];

  const prevTicket = prev && prev.won > 0 ? prev.amountNew / prev.won : 0;
  const currTicket = curr && curr.won > 0 ? curr.amountNew / curr.won : 0;

  return (
    <div className="review-section">
      <header className="review-section-heading">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: 'var(--xos-space-2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--xos-space-2)' }}>
            <h3 className="review-card-title">
              Vue globale par produit
            </h3>
            <ScopeTag scope="new" />
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

      <GlassCard className="review-chart-card">
        <h4 className="review-card-title" style={{ marginBottom: 'var(--xos-space-3)' }}>
          Indicateurs {currentProdMeta.label.toLowerCase()} — {seriesLabel(compare, data.period)} vs {seriesLabel(data.fy, data.period)}
        </h4>
        <div className="review-table-wrap">
          <table className="review-data-table">
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Indicateur</th>
                <th style={{ textAlign: 'right' }}>{seriesLabel(compare, data.period)}</th>
                <th style={{ textAlign: 'right' }}>{seriesLabel(data.fy, data.period)}</th>
                <th style={{ textAlign: 'right' }}>Écart</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Opportunités fermées (nouv. aff.)</td>
                <td style={{ textAlign: 'right' }}>{prev ? prev.closed : '—'}</td>
                <td style={{ textAlign: 'right' }}>{curr ? curr.closed : '—'}</td>
                <td style={{ textAlign: 'right' }}>{prev && curr ? fmtDeltaNumber(curr.closed, prev.closed) : '—'}</td>
              </tr>
              <tr>
                <td>Signatures (nouv. aff.)</td>
                <td style={{ textAlign: 'right' }}>{prev ? prev.won : '—'}</td>
                <td style={{ textAlign: 'right' }}>{curr ? curr.won : '—'}</td>
                <td style={{ textAlign: 'right' }}>{prev && curr ? fmtDeltaNumber(curr.won, prev.won) : '—'}</td>
              </tr>
              <tr>
                <td>Taux de closing</td>
                <td style={{ textAlign: 'right' }}>{prev ? fmtPct1(prev.closing) : '—'}</td>
                <td style={{ textAlign: 'right' }}>{curr ? fmtPct1(curr.closing) : '—'}</td>
                <td style={{ textAlign: 'right' }}>{prev && curr ? fmtDeltaPct(curr.closing, prev.closing) : '—'}</td>
              </tr>
              <tr>
                <td>CA nouvelles affaires</td>
                <td style={{ textAlign: 'right' }}>{prev ? fmtEur(prev.amountNew) : '—'}</td>
                <td style={{ textAlign: 'right' }}>{curr ? fmtEur(curr.amountNew) : '—'}</td>
                <td style={{ textAlign: 'right' }}>{prev && curr ? fmtDeltaEur(curr.amountNew, prev.amountNew) : '—'}</td>
              </tr>
              <tr>
                <td>Ticket moyen</td>
                <td style={{ textAlign: 'right' }}>{ticketLabel(prev)}</td>
                <td style={{ textAlign: 'right' }}>{ticketLabel(curr)}</td>
                <td style={{ textAlign: 'right' }}>{prev && curr && prevTicket > 0 && currTicket > 0 ? fmtDeltaEur(currTicket, prevTicket) : '—'}</td>
              </tr>
              <tr>
                <td>Cycle médian</td>
                <td style={{ textAlign: 'right' }}>{fmtDays(prev?.median)}</td>
                <td style={{ textAlign: 'right' }}>{fmtDays(curr?.median)}</td>
                <td style={{ textAlign: 'right' }}>{prev && curr ? fmtDeltaDays(curr.median, prev.median) : '—'}</td>
              </tr>
              <tr>
                <td>Cycle moyen</td>
                <td style={{ textAlign: 'right' }}>{fmtDays(prev?.mean)}</td>
                <td style={{ textAlign: 'right' }}>{fmtDays(curr?.mean)}</td>
                <td style={{ textAlign: 'right' }}>{prev && curr ? fmtDeltaDays(curr.mean, prev.mean) : '—'}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </GlassCard>

      {autre && autre.amountNew > 0 ? (
        <p className="review-section-note">
          {autre.label} : {fmtEur(autre.amountNew)} · {autre.won} signature
          {autre.won > 1 ? 's' : ''} hors des trois offres (LMS, XOS+ ou
          type vide).
        </p>
      ) : null}
    </div>
  );
}
