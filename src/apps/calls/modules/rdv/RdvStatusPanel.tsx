import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, EmptyState } from '../../../../components/ui';
import {
  fetchRdvSuivi,
  type RdvSuiviItem,
  type RdvSuiviStatus,
} from '../../api';
import type { CockpitPeriod } from '../../../../crm';
import './rdvSuivi.css';

type RdvStatusPanelProps = {
  token: string;
  period: CockpitPeriod;
  anchor: string;
  teamSfUserIds?: string[];
  onOpenSuivi?: () => void;
};

type StatusKey = RdvSuiviStatus | 'pending';

const STATUS_META: Record<StatusKey, { label: string; color: string }> = {
  a_venir: { label: 'À venir', color: 'var(--rdv-status-upcoming)' },
  effectue: { label: 'Effectué', color: 'var(--rdv-status-done)' },
  annule: { label: 'Annulé', color: 'var(--rdv-status-cancelled)' },
  no_show: { label: 'No-show', color: 'var(--rdv-status-noshow)' },
  pending: { label: 'À renseigner', color: 'var(--rdv-status-pending)' },
};

/** Ordre d'affichage de la barre de répartition. */
const STATUS_ORDER: StatusKey[] = [
  'effectue',
  'annule',
  'no_show',
  'a_venir',
  'pending',
];

function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-CA');
}

/** Convertit period + anchor (YYYY-MM-DD) en plage ISO UTC. */
function periodIsoRange(
  period: CockpitPeriod,
  anchor: string,
): { start: string; end: string } {
  const [y, m, d] = anchor.split('-').map(Number);
  let startDate = new Date(Date.UTC(y, m - 1, d));
  let endDate = new Date(Date.UTC(y, m - 1, d));

  if (period === 'week') {
    const dow = startDate.getUTCDay();
    const mondayOffset = dow === 0 ? 6 : dow - 1;
    startDate.setUTCDate(startDate.getUTCDate() - mondayOffset);
    endDate = new Date(startDate);
    endDate.setUTCDate(endDate.getUTCDate() + 6);
  } else if (period === 'month') {
    startDate = new Date(Date.UTC(y, m - 1, 1));
    endDate = new Date(Date.UTC(y, m, 0));
  }

  return {
    start: `${startDate.toISOString().slice(0, 10)}T00:00:00.000Z`,
    end: `${endDate.toISOString().slice(0, 10)}T23:59:59.999Z`,
  };
}

function formatWhen(iso: string): string {
  return (
    new Date(iso).toLocaleDateString('fr-FR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }) +
    ' · ' +
    new Date(iso).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    })
  );
}

export function RdvStatusPanel({
  token,
  period,
  anchor,
  teamSfUserIds,
  onOpenSuivi,
}: RdvStatusPanelProps) {
  const [rdvs, setRdvs] = useState<RdvSuiviItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => periodIsoRange(period, anchor), [period, anchor]);
  const today = dayKey(new Date().toISOString());

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchRdvSuivi(token, {
        teamSfUserIds,
        rangeStart: range.start,
        rangeEnd: range.end,
      });
      setRdvs(result.rdvs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [token, teamSfUserIds, range.start, range.end]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Un RDV « à renseigner » = passé et encore « à venir ». */
  const isPending = useCallback(
    (r: RdvSuiviItem) => dayKey(r.start) < today && r.status === 'a_venir',
    [today],
  );

  const counts = useMemo(() => {
    const c: Record<StatusKey, number> = {
      a_venir: 0,
      effectue: 0,
      annule: 0,
      no_show: 0,
      pending: 0,
    };
    for (const r of rdvs) {
      if (isPending(r)) c.pending += 1;
      else c[r.status] += 1;
    }
    return c;
  }, [rdvs, isPending]);

  const total = rdvs.length;

  // Liste triée : à renseigner d'abord, puis chronologique.
  const sorted = useMemo(() => {
    const copy = [...rdvs];
    copy.sort((a, b) => {
      const pa = isPending(a) ? 0 : 1;
      const pb = isPending(b) ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return a.start.localeCompare(b.start);
    });
    return copy;
  }, [rdvs, isPending]);

  const displayStatus = (r: RdvSuiviItem): StatusKey =>
    isPending(r) ? 'pending' : r.status;

  return (
    <section className="calls-section pilotage-panel rdv-status-panel">
      <div className="pilotage-panel__toolbar">
        <div>
          <h3>Statut des RDV</h3>
          <p className="pilotage-panel__hint">
            {loading
              ? 'Chargement…'
              : `${total} RDV sur la période sélectionnée.`}
          </p>
        </div>
        {onOpenSuivi && (
          <Button variant="secondary" onClick={onOpenSuivi}>
            Ouvrir le suivi →
          </Button>
        )}
      </div>

      {error && (
        <EmptyState
          title="Erreur"
          description="Impossible de charger les statuts RDV."
        />
      )}

      {!error && !loading && total === 0 && (
        <EmptyState
          title="Aucun RDV"
          description="Aucun RDV sur la période."
        />
      )}

      {!error && total > 0 && (
        <>
          {/* Barre de répartition proportionnelle */}
          <div
            className="rdv-status-bar"
            role="img"
            aria-label="Répartition des statuts RDV"
          >
            {STATUS_ORDER.filter((s) => counts[s] > 0).map((s) => (
              <span
                key={s}
                className="rdv-status-bar__seg"
                style={{
                  width: `${(counts[s] / total) * 100}%`,
                  background: STATUS_META[s].color,
                }}
                title={`${STATUS_META[s].label} : ${counts[s]}`}
              />
            ))}
          </div>

          {/* Légende chiffrée */}
          <div className="rdv-status-legend">
            {STATUS_ORDER.map((s) => (
              <span key={s} className="rdv-status-legend__item">
                <span
                  className={`rdv-status-legend__dot${s === 'pending' ? ' rdv-status-legend__dot--pulse' : ''}`}
                  style={{ background: STATUS_META[s].color }}
                />
                <strong className="xos-numeric">{counts[s]}</strong>
                <span className="pilotage-muted">{STATUS_META[s].label}</span>
              </span>
            ))}
          </div>

          {/* Détail */}
          <table className="pilotage-table rdv-status-table">
            <thead>
              <tr>
                <th>Quand</th>
                <th>Contact</th>
                <th>Commercial</th>
                <th>Sujet</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, 12).map((r) => {
                const s = displayStatus(r);
                return (
                  <tr
                    key={r.sf_event_id}
                    className={
                      s === 'pending' ? 'rdv-status-row--pending' : undefined
                    }
                  >
                    <td className="xos-numeric">{formatWhen(r.start)}</td>
                    <td>
                      <strong>{r.contact_name || '—'}</strong>
                      {r.account_name && (
                        <span className="pilotage-muted">
                          {' '}
                          · {r.account_name}
                        </span>
                      )}
                    </td>
                    <td>{r.owner_name || '—'}</td>
                    <td className="pilotage-muted">{r.subject}</td>
                    <td>
                      <span
                        className="rdv-status-badge"
                        style={{
                          color: STATUS_META[s].color,
                          borderColor: STATUS_META[s].color,
                        }}
                      >
                        {STATUS_META[s].label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {total > 12 && (
            <p className="pilotage-muted rdv-status-more">
              + {total - 12} autre{total - 12 > 1 ? 's' : ''} RDV — ouvrez le
              suivi pour tout voir.
            </p>
          )}
        </>
      )}
    </section>
  );
}
