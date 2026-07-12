import { useCallback, useEffect, useState } from 'react';
import {
  fetchOpportunityAnalytics,
  type OpportunityAnalyticsResponse,
} from './api';
import type { OpportunityFilters } from './filterState';

type Analytics = Record<string, unknown>;

type OpportunitiesAnalyticsViewProps = {
  accessToken?: string;
  period?: string;
  onNavigateToCleaning: (filters: Partial<OpportunityFilters>) => void;
};

function record(value: unknown): Analytics {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Analytics)
    : {};
}

function list(value: unknown): Analytics[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Analytics =>
          Boolean(item) && typeof item === 'object' && !Array.isArray(item),
      )
    : [];
}

function number(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : Number(value) || 0;
}

function label(row: Analytics, fallback = '—'): string {
  const value = row.label ?? row.owner ?? row.stage ?? row.bucket ?? row.ruleId;
  return value == null || value === '' ? fallback : String(value);
}

function amount(value: unknown): string {
  return `${number(value).toLocaleString('fr-FR')} €`;
}

function percent(value: unknown): string {
  return `${Math.round(number(value) * 100)} %`;
}

function clickableRow(
  row: Analytics,
  key: string,
  onNavigateToCleaning: OpportunitiesAnalyticsViewProps['onNavigateToCleaning'],
) {
  if (key === 'owner')
    return { owners: [String(row.owner ?? row.label ?? row.ownerId)] };
  if (key === 'stage') return { search: String(row.stage ?? row.label ?? '') };
  if (key === 'reason') {
    const ruleId = String(row.ruleId ?? '');
    const family = ruleId.includes('owner')
      ? 'owner'
      : ruleId.includes('amount') || ruleId.includes('probability')
        ? 'amount'
        : ruleId.includes('stage')
          ? 'stage'
          : ruleId.includes('close_date') || ruleId.includes('age')
            ? 'timing'
            : 'other';
    return { reasonFamilies: { [family]: [ruleId] } };
  }
  if (key === 'overdue')
    return { reasonFamilies: { timing: ['opportunity.close_date.past'] } };
  onNavigateToCleaning({});
  return null;
}

function kpiNavigation(kind: string): Partial<OpportunityFilters> {
  if (kind === 'overdue')
    return { reasonFamilies: { timing: ['opportunity.close_date.past'] } };
  if (kind === 'inactiveOwners')
    return { reasonFamilies: { owner: ['opportunity.owner.inactive'] } };
  if (kind === 'amountIncoherent')
    return {
      reasonFamilies: {
        amount: [
          'opportunity.amount.missing',
          'opportunity.amount.implausible',
        ],
      },
    };
  return {};
}

function DistributionTable({
  title,
  rows,
  kind,
  onNavigateToCleaning,
}: {
  title: string;
  rows: Analytics[];
  kind: 'owner' | 'stage' | 'overdue' | 'reason';
  onNavigateToCleaning: OpportunitiesAnalyticsViewProps['onNavigateToCleaning'];
}) {
  return (
    <section className="cleaner-opportunities__analytics-card">
      <h3>{title}</h3>
      {rows.length === 0 ? (
        <p className="cleaner-opportunities__analytics-muted">
          Aucune donnée sur la période.
        </p>
      ) : (
        <div className="cleaner-opportunities__table-wrap">
          <table className="cleaner-opportunities__table">
            <thead>
              <tr>
                <th scope="col">Catégorie</th>
                <th scope="col">Volume</th>
                <th scope="col">CA concerné</th>
                {kind === 'owner' ? <th scope="col">Statut</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const rowLabel = label(row);
                const navigation = clickableRow(
                  row,
                  kind,
                  onNavigateToCleaning,
                );
                return (
                  <tr
                    key={`${kind}-${String(row.key ?? row.ruleId ?? row.ownerId ?? index)}`}
                  >
                    <td>
                      <button
                        type="button"
                        className="cleaner-opportunities__analytics-link"
                        aria-label={`${rowLabel} · ${number(row.count)} éléments`}
                        onClick={() =>
                          navigation && onNavigateToCleaning(navigation)
                        }
                      >
                        {rowLabel}
                      </button>
                    </td>
                    <td>{number(row.count)}</td>
                    <td>{amount(row.amount)}</td>
                    {kind === 'owner' ? (
                      <td>
                        {row.active === true
                          ? 'Actif'
                          : row.active === false
                            ? 'Inactif'
                            : 'Inconnu'}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function OpportunitiesAnalyticsView({
  accessToken,
  period,
  onNavigateToCleaning,
}: OpportunitiesAnalyticsViewProps) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>(
    'loading',
  );
  const [payload, setPayload] = useState<OpportunityAnalyticsResponse | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setStatus('loading');
    setError(null);
    fetchOpportunityAnalytics(accessToken, { period })
      .then((next) => {
        setPayload(next);
        const totals = record(next.analytics.totals);
        setStatus(
          number(totals.totalItems) > 0 ||
            list(next.analytics.ownerDistribution).length > 0
            ? 'ready'
            : 'empty',
        );
      })
      .catch((cause: unknown) => {
        setError(
          cause instanceof Error
            ? cause.message
            : 'La synthèse est indisponible.',
        );
        setStatus('error');
      });
  }, [accessToken, period]);

  useEffect(() => {
    load();
  }, [load]);

  if (status === 'loading')
    return (
      <div
        className="cleaner-opportunities__analytics-state"
        role="status"
        aria-busy="true"
      >
        Chargement de la synthèse…
      </div>
    );
  if (status === 'error')
    return (
      <div className="cleaner-opportunities__analytics-state" role="alert">
        <p>{error || 'La synthèse est indisponible.'}</p>
        <button type="button" onClick={load}>
          Actualiser
        </button>
      </div>
    );
  if (status === 'empty' || !payload)
    return (
      <div className="cleaner-opportunities__analytics-state" role="status">
        <p>Aucune donnée analytique sur la période.</p>
        <button type="button" onClick={load}>
          Actualiser
        </button>
      </div>
    );

  const analytics = payload.analytics;
  const totals = record(analytics.totals);
  const corrections = record(analytics.corrections);
  const evolution = list(analytics.anomalyEvolution);
  const periodLabel = String(
    record(analytics.period).label ??
      record(analytics.period).today ??
      period ??
      'Période courante',
  );
  return (
    <section
      className="cleaner-opportunities__analytics"
      aria-labelledby="cleaner-opportunities-analytics-title"
    >
      <div className="cleaner-opportunities__intro">
        <div>
          <p className="cleaner-eyebrow">Synthèse</p>
          <h2 id="cleaner-opportunities-analytics-title">
            Santé factuelle des opportunités
          </h2>
          <p className="cleaner-opportunities__analytics-period">
            Période : <span>{periodLabel}</span>
          </p>
        </div>
        <button
          type="button"
          className="xos-btn xos-btn--secondary"
          onClick={load}
        >
          Actualiser
        </button>
      </div>
      <div
        className="cleaner-opportunities__analytics-kpis"
        aria-label="Indicateurs de synthèse"
      >
        {[
          ['Anomalies', totals.anomalies, ''],
          [
            'Enregistrements concernés',
            totals.affectedItems ?? totals.totalItems,
            '',
          ],
          ['CA concerné', amount(totals.amount), ''],
          ['En retard', totals.overdue, 'overdue'],
          ['Owners inactifs', totals.inactiveOwners, 'inactiveOwners'],
          ['Montants incohérents', totals.amountIncoherent, 'amountIncoherent'],
        ].map(([name, value, kind]) => (
          <button
            type="button"
            key={String(name)}
            onClick={() => onNavigateToCleaning(kpiNavigation(String(kind)))}
          >
            <strong>{String(value)}</strong>
            <span>{String(name)}</span>
          </button>
        ))}
        <div className="cleaner-opportunities__analytics-kpi">
          <strong>
            {number(corrections.resolved)} / {number(corrections.total)}
          </strong>
          <span>Corrections réussies</span>
        </div>
        <div className="cleaner-opportunities__analytics-kpi">
          <strong>
            {percent(corrections.resolutionRate ?? analytics.resolutionRate)}
          </strong>
          <span>Taux de résolution</span>
        </div>
      </div>
      <div className="cleaner-opportunities__analytics-grid">
        <DistributionTable
          title="Répartition par owner"
          rows={list(analytics.ownerDistribution)}
          kind="owner"
          onNavigateToCleaning={onNavigateToCleaning}
        />
        <DistributionTable
          title="Répartition par étape"
          rows={list(analytics.stageDistribution)}
          kind="stage"
          onNavigateToCleaning={onNavigateToCleaning}
        />
        <DistributionTable
          title="Ancienneté de CloseDate dépassée"
          rows={list(analytics.overdueDistribution)}
          kind="overdue"
          onNavigateToCleaning={onNavigateToCleaning}
        />
        <DistributionTable
          title="Catégories / familles de raisons"
          rows={list(analytics.reasonDistribution)}
          kind="reason"
          onNavigateToCleaning={onNavigateToCleaning}
        />
      </div>
      <section className="cleaner-opportunities__analytics-card">
        <h3>Évolution</h3>
        {evolution.length === 0 ? (
          <p className="cleaner-opportunities__analytics-muted">
            Aucune correction enregistrée sur la période.
          </p>
        ) : (
          <div className="cleaner-opportunities__table-wrap">
            <table className="cleaner-opportunities__table">
              <thead>
                <tr>
                  <th>Période</th>
                  <th>Anomalies</th>
                  <th>Corrections</th>
                  <th>Résolues</th>
                  <th>Échecs</th>
                </tr>
              </thead>
              <tbody>
                {evolution.map((row, index) => (
                  <tr key={`${String(row.period)}-${index}`}>
                    <td>{String(row.period ?? '—')}</td>
                    <td>{number(row.anomalies)}</td>
                    <td>{number(row.corrections)}</td>
                    <td>{number(row.resolved)}</td>
                    <td>{number(row.failed)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}

export default OpportunitiesAnalyticsView;
