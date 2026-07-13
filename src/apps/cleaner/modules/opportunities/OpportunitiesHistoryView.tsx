import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchOpportunityHistory, type OpportunityHistoryItem } from './api';

type OpportunitiesHistoryViewProps = {
  accessToken?: string;
  role?: 'commercial' | 'manager' | 'admin';
  selectedOpportunityCount?: number;
};

function text(value: unknown, fallback = '—'): string {
  return value == null || value === '' ? fallback : String(value);
}

function json(value: unknown): string {
  if (value == null) return '—';
  try {
    return JSON.stringify(value);
  } catch {
    return '—';
  }
}

function targetsOf(
  item: OpportunityHistoryItem,
): Array<Record<string, unknown>> {
  return Array.isArray(item.cleaner_action_targets)
    ? item.cleaner_action_targets
    : Array.isArray(item.targets)
      ? (item.targets as Array<Record<string, unknown>>)
      : [];
}

function outcomeOf(
  target: Record<string, unknown>,
  item: OpportunityHistoryItem,
): string {
  if (target.success === true) return 'Réussi';
  if (target.success === false)
    return `Échec${target.error ? ` · ${target.error}` : ''}`;
  const result = item.result || {};
  return number(result.failed) > 0 ? 'Partiel / échec' : 'Enregistré';
}

function number(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : Number(value) || 0;
}

function isSchemaCacheError(cause: unknown): boolean {
  if (!cause || typeof cause !== 'object') return false;
  const code = 'code' in cause ? cause.code : undefined;
  const message = cause instanceof Error ? cause.message : String(cause);
  return (
    code === 'schema_cache' ||
    /relationship between\s+action_journal\s+and\s+cleaner_action_targets/i.test(
      message,
    )
  );
}

export function OpportunitiesHistoryView({
  accessToken,
  role,
  selectedOpportunityCount = 0,
}: OpportunitiesHistoryViewProps) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>(
    'loading',
  );
  const [items, setItems] = useState<OpportunityHistoryItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [cursorStack, setCursorStack] = useState<string[]>(['']);
  const [actorFilter, setActorFilter] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [schemaCacheError, setSchemaCacheError] = useState(false);

  const cursor = cursorStack[cursorStack.length - 1] || null;
  const load = useCallback(
    async (requestedCursor: string | null) => {
      setStatus('loading');
      setError(null);
      setSchemaCacheError(false);
      try {
        const response = await fetchOpportunityHistory(accessToken, {
          cursor: requestedCursor,
          limit: 25,
        });
        setItems(response.items);
        setNextCursor(response.nextCursor || null);
        setStatus(response.items.length ? 'ready' : 'empty');
      } catch (cause: unknown) {
        setSchemaCacheError(isSchemaCacheError(cause));
        setError(
          cause instanceof Error
            ? cause.message
            : 'L’historique est indisponible.',
        );
        setStatus('error');
      }
    },
    [accessToken],
  );

  useEffect(() => {
    load(cursor);
  }, [load, cursor]);

  const filteredItems = useMemo(
    () =>
      items.filter((item) => {
        const actor = text(
          item.actor_label || item.actor,
          'Legacy CRM Cleaner',
        );
        if (actorFilter && actor !== actorFilter) return false;
        if (!outcomeFilter) return true;
        return targetsOf(item).some(
          (target) => outcomeOf(target, item) === outcomeFilter,
        );
      }),
    [items, actorFilter, outcomeFilter],
  );
  const actors = [
    ...new Set(
      items.map((item) =>
        text(item.actor_label || item.actor, 'Legacy CRM Cleaner'),
      ),
    ),
  ];
  const outcomes = [
    ...new Set(
      items.flatMap((item) =>
        targetsOf(item).map((target) => outcomeOf(target, item)),
      ),
    ),
  ];

  const next = () => {
    if (!nextCursor) return;
    setCursorStack((current) => [...current, nextCursor]);
  };
  const previous = () => {
    if (cursorStack.length <= 1) return;
    setCursorStack((current) => current.slice(0, -1));
  };

  if (status === 'loading')
    return (
      <div
        className="cleaner-opportunities__history-state"
        role="status"
        aria-busy="true"
      >
        Chargement de l’historique…
      </div>
    );
  if (status === 'error')
    return (
      <div className="cleaner-opportunities__history-state" role="alert">
        {schemaCacheError ? (
          <>
            <p>
              Le cache du schéma Supabase n’est pas à jour. Appliquez la
              migration 026_reload_postgrest_schema.sql puis réessayez.
            </p>
            <p>
              <a href="/supabase/migrations/026_reload_postgrest_schema.sql">
                supabase/migrations/026_reload_postgrest_schema.sql
              </a>
            </p>
          </>
        ) : (
          <p>{error || 'L’historique est indisponible.'}</p>
        )}
        <button type="button" onClick={() => load(cursor)}>
          Actualiser
        </button>
      </div>
    );
  return (
    <section
      className="cleaner-opportunities__history"
      aria-labelledby="cleaner-opportunities-history-title"
    >
      <div className="cleaner-opportunities__intro">
        <div>
          <p className="cleaner-eyebrow">Historique</p>
          <h2 id="cleaner-opportunities-history-title">
            Journal des corrections
          </h2>
          <p className="cleaner-opportunities__analytics-period">
            Source : Supabase action_journal · portée appliquée par le serveur
          </p>
        </div>
        <button
          type="button"
          className="xos-btn xos-btn--secondary"
          onClick={() => load(cursor)}
        >
          Actualiser
        </button>
      </div>
      <div className="cleaner-opportunities__history-filters">
        <label>
          Acteur
          <select
            aria-label="Filtrer par acteur"
            value={actorFilter}
            onChange={(event) => setActorFilter(event.target.value)}
          >
            <option value="">Tous</option>
            {actors.map((actor) => (
              <option key={actor}>{actor}</option>
            ))}
          </select>
        </label>
        <label>
          Résultat
          <select
            aria-label="Filtrer par résultat"
            value={outcomeFilter}
            onChange={(event) => setOutcomeFilter(event.target.value)}
          >
            <option value="">Tous</option>
            {outcomes.map((outcome) => (
              <option key={outcome}>{outcome}</option>
            ))}
          </select>
        </label>
      </div>
      {status === 'empty' ? (
        <div className="cleaner-opportunities__history-state" role="status">
          {selectedOpportunityCount > 0
            ? "Pas encore d'historique pour vos opportunités — vos actions apparaîtront ici après la première commande."
            : 'Aucune action dans votre périmètre.'}
        </div>
      ) : (
        <div className="cleaner-opportunities__table-wrap">
          <table className="cleaner-opportunities__table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Acteur</th>
                <th>Module / action</th>
                <th>Enregistrement</th>
                <th>Avant</th>
                <th>Après</th>
                <th>Résultat / erreur</th>
                <th>Replay / idempotence</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) =>
                targetsOf(item).length ? (
                  targetsOf(item).map((target, index) => {
                    const legacyVisible = role !== 'commercial';
                    const actor = item.actor
                      ? text(item.actor_label || item.actor)
                      : legacyVisible
                        ? text(
                            item.actor_label ||
                              (item.source === 'legacy_blob'
                                ? 'Legacy CRM Cleaner'
                                : null),
                          )
                        : '—';
                    const recordId = text(
                      target.sf_record_id || target.sfRecordId || item.id,
                    );
                    return (
                      <tr key={`${String(item.id)}-${recordId}-${index}`}>
                        <td>{text(item.at || item.created_at)}</td>
                        <td>{actor}</td>
                        <td>
                          <span>{text(item.module_id)}</span> /{' '}
                          <span>{text(item.action_type)}</span>
                        </td>
                        <td>{recordId}</td>
                        <td>{json(target.before_state || target.before)}</td>
                        <td>{json(target.after_state || target.after)}</td>
                        <td>{outcomeOf(target, item)}</td>
                        <td>
                          {text(
                            item.replayed === true ||
                              item.result?.replayed === true
                              ? 'Replay'
                              : '—',
                          )}{' '}
                          · {text(item.idempotency_key || item.command_id)}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr key={String(item.id)}>
                    <td>{text(item.at || item.created_at)}</td>
                    <td>{text(item.actor_label || item.actor)}</td>
                    <td>
                      <span>{text(item.module_id)}</span> /{' '}
                      <span>{text(item.action_type)}</span>
                    </td>
                    <td>{text(item.id)}</td>
                    <td>—</td>
                    <td>—</td>
                    <td>{outcomeOf({}, item)}</td>
                    <td>{text(item.idempotency_key || item.command_id)}</td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
      <div className="cleaner-opportunities__history-pagination">
        <button
          type="button"
          aria-label="Page précédente"
          disabled={cursorStack.length <= 1}
          onClick={previous}
        >
          Page précédente
        </button>
        <span>Page {cursorStack.length}</span>
        <button
          type="button"
          aria-label="Page suivante"
          disabled={!nextCursor}
          onClick={next}
        >
          Page suivante
        </button>
      </div>
    </section>
  );
}

export default OpportunitiesHistoryView;
