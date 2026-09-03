import { useState } from 'react';
import { Button, EmptyState, GlassCard, Skeleton } from '../../../components/ui';
import { ScopeTag } from '../components/ScopeTag';
import { fmtDays, fmtEur, fmtPct1 } from '../review.helpers';
import { seriesLabel } from '../review.period';
import type { ProductPayload, ProductRow } from '../review.types';

type FilterKey = 'catalogue' | 'sur_mesure' | 'conseil' | 'autre' | 'all';

const TABS: { key: FilterKey; label: string }[] = [
  { key: 'catalogue', label: 'Catalogue' },
  { key: 'sur_mesure', label: 'Sur-mesure' },
  { key: 'conseil', label: 'Conseil' },
  { key: 'all', label: 'Tous' },
];

const ALL_KEYS = ['catalogue', 'sur_mesure', 'conseil', 'autre'] as const;

export function ProductHistorySection({
  data,
  loading,
}: {
  data: ProductPayload | null;
  loading: boolean;
}) {
  const [filter, setFilter] = useState<FilterKey>('catalogue');

  if (loading && !data) {
    return (
      <div className="review-section">
        <Skeleton height={200} />
      </div>
    );
  }
  if (!data?.series?.length) {
    return (
      <EmptyState
        title="Historique produit indisponible"
        description="Pas de série produit × exercice."
      />
    );
  }

  // Filtrage selon onglet
  const activeKeys =
    filter === 'all'
      ? ALL_KEYS.filter((key) => {
          if (key !== 'autre') return true;
          return data.series.some(
            (y) => y.products.autre.amountNew > 0 || y.products.autre.won > 0,
          );
        })
      : [filter];

  return (
    <div className="review-section">
      <header className="review-section-heading">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: 'var(--xos-space-2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--xos-space-2)' }}>
            <h3 className="review-card-title">
              Historique produit
            </h3>
            <ScopeTag scope="new" />
          </div>
          <div className="review-period-selector" role="tablist" aria-label="Filtre produit">
            {TABS.map((t) => (
              <Button
                key={t.key}
                type="button"
                variant="ghost"
                size="sm"
                role="tab"
                aria-selected={filter === t.key}
                className={filter === t.key ? 'review-period-button--active' : ''}
                onClick={() => setFilter(t.key)}
              >
                {t.label}
              </Button>
            ))}
          </div>
        </div>
      </header>

      <GlassCard className="review-chart-card">
        <div className="review-table-wrap">
          <table className="review-data-table review-data-table--wide">
            <thead>
              <tr>
                {filter === 'all' && <th style={{ textAlign: 'left' }}>Produit</th>}
                <th style={{ textAlign: 'left' }}>Exercice</th>
                <th style={{ textAlign: 'right' }}>Fermées</th>
                <th style={{ textAlign: 'right' }}>Signatures</th>
                <th style={{ textAlign: 'right' }}>Perdues</th>
                <th style={{ textAlign: 'right' }}>Closing</th>
                <th style={{ textAlign: 'right' }}>CA nouvelles affaires</th>
                <th style={{ textAlign: 'right' }}>Cycle médian</th>
              </tr>
            </thead>
            <tbody>
              {activeKeys.map((key) =>
                data.series.map((year, index) => {
                  const prod: ProductRow = year.products[key];
                  if (!prod) return null;
                  const isCurrent = year.fy === data.fy;
                  return (
                    <tr
                      key={`${key}-${year.fy}`}
                      className={isCurrent ? 'review-data-table__current' : undefined}
                    >
                      {filter === 'all' && index === 0 ? (
                        <td
                          rowSpan={data.series.length}
                          style={{ fontWeight: 600, verticalAlign: 'top' }}
                        >
                          {prod.label}
                        </td>
                      ) : null}
                      <td>{seriesLabel(year.fy, data.period)}</td>
                      <td style={{ textAlign: 'right' }}>{prod.closed}</td>
                      <td style={{ textAlign: 'right' }}>{prod.won}</td>
                      <td style={{ textAlign: 'right' }}>
                        {prod.closed - prod.won}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {fmtPct1(prod.closing)}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {fmtEur(prod.amountNew)}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {fmtDays(prod.median)}
                      </td>
                    </tr>
                  );
                }),
              )}
            </tbody>
          </table>
        </div>
        <p className="review-section-note">
          La ligne « Autre / non défini » absorbe LMS, XOS+ et type vide — sans
          elle le total des nouvelles affaires ne conserve pas.
        </p>
      </GlassCard>
    </div>
  );
}
