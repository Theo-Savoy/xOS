import { EmptyState, GlassCard, Skeleton } from '../../../components/ui';
import { ScopeTag } from '../components/ScopeTag';
import { fmtDays, fmtEur, fmtPct1 } from '../review.helpers';
import { seriesLabel } from '../review.period';
import type { ProductPayload, ProductRow, ProductYear } from '../review.types';

function ticketLabel(row: ProductRow): string {
  return row.won > 0 ? fmtEur(row.amountNew / row.won) : '—';
}

function Metric({
  label,
  left,
  right,
}: {
  label: string;
  left: string;
  right: string;
}) {
  return (
    <div className="review-compare-metric">
      <span className="review-compare-label">{label}</span>
      <span>{left}</span>
      <span>{right}</span>
    </div>
  );
}

function ProductColumn({
  title,
  prev,
  curr,
  prevFy,
  currFy,
}: {
  title: string;
  prev: ProductRow | undefined;
  curr: ProductRow | undefined;
  prevFy: string;
  currFy: string;
}) {
  if (!prev || !curr) return null;
  return (
    <GlassCard className="review-chart-card">
      <h3 className="review-card-title">{title}</h3>
      <div className="review-compare-head">
        <span />
        <span>{prevFy}</span>
        <span>{currFy}</span>
      </div>
      <Metric
        label="Fermées NEW"
        left={String(prev.closed)}
        right={String(curr.closed)}
      />
      <Metric
        label="Signatures NEW"
        left={String(prev.won)}
        right={String(curr.won)}
      />
      <Metric
        label="Closing NEW"
        left={fmtPct1(prev.closing)}
        right={fmtPct1(curr.closing)}
      />
      <Metric
        label="CA NEW"
        left={fmtEur(prev.amountNew)}
        right={fmtEur(curr.amountNew)}
      />
      <Metric
        label="Ticket NEW"
        left={ticketLabel(prev)}
        right={ticketLabel(curr)}
      />
      <Metric
        label="Cycle médian"
        left={fmtDays(prev.median)}
        right={fmtDays(curr.median)}
      />
      <Metric
        label="Cycle moyen"
        left={fmtDays(prev.mean)}
        right={fmtDays(curr.mean)}
      />
    </GlassCard>
  );
}

function yearOf(series: ProductYear[], fy: string) {
  return series.find((row) => row.fy === fy);
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

  const curr = yearOf(data.series, data.fy) || data.series.at(-1);
  const prev = yearOf(data.series, compare);
  const autre = curr?.products.autre;

  return (
    <div className="review-section">
      <header className="review-section-heading">
        <div>
          <h3 className="review-card-title">
            Catalogue vs sur-mesure : comparaison d&apos;exercices{' '}
            <ScopeTag scope="new" />
          </h3>
          <p className="review-section-kicker">
            CA NEW · {seriesLabel(compare, data.period)}→
            {seriesLabel(data.fy, data.period)} · fermées, signatures, closing,
            ticket, cycles
          </p>
        </div>
      </header>

      <div className="review-compare-grid">
        <ProductColumn
          title="Catalogue"
          prev={prev?.products.catalogue}
          curr={curr?.products.catalogue}
          prevFy={seriesLabel(compare, data.period)}
          currFy={seriesLabel(data.fy, data.period)}
        />
        <ProductColumn
          title="Sur-mesure"
          prev={prev?.products.sur_mesure}
          curr={curr?.products.sur_mesure}
          prevFy={seriesLabel(compare, data.period)}
          currFy={seriesLabel(data.fy, data.period)}
        />
      </div>

      {autre && autre.amountNew > 0 ? (
        <p className="review-section-note">
          {autre.label} : {fmtEur(autre.amountNew)} · {autre.won} signature
          {autre.won > 1 ? 's' : ''} NEW hors des trois offres (LMS, XOS+ ou
          type vide).
        </p>
      ) : null}
    </div>
  );
}
