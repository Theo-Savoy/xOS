import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from '../../../../auth/useSession';
import {
  Button,
  DatePicker,
  EmptyState,
  Skeleton,
  TimePicker,
} from '../../../../components/ui';
import { todayParisIso } from '../../../../lib/dates';
import {
  fetchRdvSuivi,
  reportRdv,
  type RdvSuiviItem,
  type RdvSuiviStatus,
} from '../../api';
import './rdvSuivi.css';

type RdvSuiviViewProps = {
  teamSfUserIds?: string[];
};

type Period = 'week' | 'month' | 'all';

const PERIOD_OPTIONS: readonly { value: Period; label: string }[] = [
  { value: 'week', label: 'Semaine' },
  { value: 'month', label: 'Mois' },
  { value: 'all', label: 'Tout' },
];

const STATUS_LABELS: Record<RdvSuiviStatus, string> = {
  a_venir: 'À venir',
  effectue: 'Effectué',
  annule: 'Annulé',
  no_show: 'No-show',
};

const STATUS_COLORS: Record<RdvSuiviStatus, string> = {
  a_venir: 'var(--xos-accent)',
  effectue: 'var(--xos-accent-success)',
  annule: 'var(--xos-accent-warning)',
  no_show: 'var(--xos-accent-danger)',
};

/** Actions du panneau de qualification — « Reporter » est une action, pas un statut. */
const REPORT_ACTION = 'report' as const;
type FormStatus = RdvSuiviStatus | typeof REPORT_ACTION;

const STATUS_ACTIONS: readonly {
  value: FormStatus;
  label: string;
  color: string;
}[] = [
  { value: 'effectue', label: 'Effectué', color: 'var(--xos-accent-success)' },
  { value: 'annule', label: 'Annulé', color: 'var(--xos-accent-warning)' },
  { value: 'no_show', label: 'No-show', color: 'var(--xos-accent-danger)' },
  { value: REPORT_ACTION, label: 'Reporter', color: 'var(--xos-accent)' },
];

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-CA'); // YYYY-MM-DD
}

/** Heure locale HH:MM d'un ISO. */
function isoToLocalTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function sectionLabel(key: string, today: string): string {
  if (key === today) return "Aujourd'hui";
  const tomorrow = new Date(
    new Date(today + 'T12:00:00').getTime() + 86400_000,
  ).toLocaleDateString('fr-CA');
  if (key === tomorrow) return 'Demain';
  return formatDateShort(key + 'T12:00:00');
}

/** Compute ISO range for the selected period. Returns null for "all". */
function periodRange(period: Period): { start: string; end: string } | null {
  if (period === 'all') return null;
  const now = new Date();
  const today = new Date(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()),
  );

  if (period === 'week') {
    const dow = today.getUTCDay();
    const mondayOffset = dow === 0 ? 6 : dow - 1;
    const start = new Date(today);
    start.setUTCDate(start.getUTCDate() - mondayOffset);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    return {
      start: start.toISOString().slice(0, 10) + 'T00:00:00.000Z',
      end: end.toISOString().slice(0, 10) + 'T23:59:59.999Z',
    };
  }

  // month
  const start = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
  const end = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0));
  return {
    start: start.toISOString().slice(0, 10) + 'T00:00:00.000Z',
    end: end.toISOString().slice(0, 10) + 'T23:59:59.999Z',
  };
}

export function RdvSuiviView({ teamSfUserIds }: RdvSuiviViewProps) {
  const { session } = useSession();
  const token = session?.access_token ?? '';

  const [period, setPeriod] = useState<Period>('week');
  const [rdvs, setRdvs] = useState<RdvSuiviItem[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [sfWarning, setSfWarning] = useState<string | null>(null);

  // Report form state
  const [formStatus, setFormStatus] = useState<FormStatus>('effectue');
  const [formNotes, setFormNotes] = useState('');
  const [formNewDate, setFormNewDate] = useState('');
  const [formNewTime, setFormNewTime] = useState('');

  const range = useMemo(() => periodRange(period), [period]);
  const hasLoadedOnce = useRef(false);

  const load = useCallback(async () => {
    if (!token) {
      setInitialLoading(false);
      return;
    }
    if (!hasLoadedOnce.current) {
      setInitialLoading(true);
    }
    setError(null);
    try {
      const result = await fetchRdvSuivi(token, {
        teamSfUserIds,
        rangeStart: range?.start,
        rangeEnd: range?.end,
      });
      setRdvs(result.rdvs);
      setPendingCount(result.pending_count);
      hasLoadedOnce.current = true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    } finally {
      setInitialLoading(false);
    }
  }, [token, teamSfUserIds, range?.start, range?.end]);

  useEffect(() => {
    void load();
  }, [load]);

  const today = todayParisIso();

  // Group RDVs into sections
  const sections = useMemo(() => {
    const past: RdvSuiviItem[] = [];
    const byDay = new Map<string, RdvSuiviItem[]>();

    for (const rdv of rdvs) {
      const key = dayKey(rdv.start);
      if (key < today) {
        past.push(rdv);
      } else {
        if (!byDay.has(key)) byDay.set(key, []);
        byDay.get(key)!.push(rdv);
      }
    }

    const sortedDays = [...byDay.entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return { past, upcoming: sortedDays };
  }, [rdvs, today]);

  const handleExpand = (rdv: RdvSuiviItem) => {
    if (expandedId === rdv.sf_event_id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(rdv.sf_event_id);
    setFormStatus(rdv.status === 'a_venir' ? 'effectue' : rdv.status);
    setFormNotes(rdv.notes || '');
    setFormNewDate('');
    setFormNewTime(isoToLocalTime(rdv.start));
    setSaveError(null);
    setSfWarning(null);
  };

  const handleSubmit = async (rdv: RdvSuiviItem) => {
    if (!token) return;
    setSaving(true);
    setSaveError(null);
    setSfWarning(null);
    try {
      const isReport = formStatus === REPORT_ACTION;
      const durationMin = rdv.end
        ? Math.max(
            15,
            Math.round(
              (new Date(rdv.end).getTime() - new Date(rdv.start).getTime()) /
                60000,
            ),
          )
        : 60;

      const result = await reportRdv(token, {
        sf_event_id: rdv.sf_event_id,
        status: isReport ? 'a_venir' : formStatus,
        notes: formNotes.trim() || undefined,
        ...(isReport && formNewDate
          ? {
              new_start: new Date(
                `${formNewDate}T${formNewTime || '09:00'}:00`,
              ).toISOString(),
              duration_min: durationMin,
            }
          : {}),
      });
      if (result.sf_sync_failed) {
        setSfWarning(
          'Enregistré localement, mais la synchro Salesforce a échoué.',
        );
      }
      // Update local state
      setRdvs((prev) =>
        prev.map((r) =>
          r.sf_event_id === rdv.sf_event_id
            ? {
                ...r,
                status: isReport ? 'a_venir' : formStatus,
                notes: formNotes.trim() || null,
                reported_at: new Date().toISOString(),
              }
            : r,
        ),
      );
      if (!result.sf_sync_failed) {
        setExpandedId(null);
      }
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Erreur d'enregistrement",
      );
    } finally {
      setSaving(false);
    }
  };

  const hasData = rdvs.length > 0;
  return (
    <div className="calls-view rdv-suivi" aria-label="Suivi des rendez-vous">
      <header className="calls-view__header">
        <div className="calls-view__actions">
          <div
            className="calls-seg"
            role="group"
            aria-label="Période"
          >
            {PERIOD_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                variant="ghost"
                type="button"
                className={`calls-seg__btn${period === opt.value ? ' calls-seg__btn--active' : ''}`}
                aria-pressed={period === opt.value}
                onClick={() => setPeriod(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>
      </header>

      {error && (
        <p className="rdv-suivi__error" role="alert">
          {error}
        </p>
      )}

      {pendingCount > 0 && (
        <div className="rdv-suivi__banner" role="status">
          ⚠ {pendingCount} RDV passé{pendingCount > 1 ? 's' : ''} sans
          compte-rendu
        </div>
      )}

      <div className="rdv-suivi__content" aria-busy={initialLoading}>
        {initialLoading ? (
          <section className="calls-section rdv-suivi__section">
            <h2 className="rdv-suivi__section-title">À renseigner</h2>
            <Skeleton height={44} />
            <Skeleton height={44} />
            <Skeleton height={44} />
          </section>
        ) : (
          <>
            {/* Past / À renseigner */}
            {sections.past.length > 0 && (
              <section className="calls-section rdv-suivi__section">
                <h2 className="rdv-suivi__section-title">À renseigner</h2>
                {sections.past.map((rdv) => (
                  <RdvRow
                    key={rdv.sf_event_id}
                    rdv={rdv}
                    expanded={expandedId === rdv.sf_event_id}
                    onExpand={() => handleExpand(rdv)}
                    formStatus={formStatus}
                    formNotes={formNotes}
                    formNewDate={formNewDate}
                    formNewTime={formNewTime}
                    saving={saving}
                    saveError={saveError}
                    sfWarning={sfWarning}
                    onStatusChange={setFormStatus}
                    onNotesChange={setFormNotes}
                    onNewDateChange={setFormNewDate}
                    onNewTimeChange={setFormNewTime}
                    onSubmit={() => void handleSubmit(rdv)}
                  />
                ))}
              </section>
            )}

            {/* Upcoming by day */}
            {sections.upcoming.map(([key, items]) => (
              <section key={key} className="calls-section rdv-suivi__section">
                <h2 className="rdv-suivi__section-title">
                  {sectionLabel(key, today)}
                </h2>
                {items.map((rdv) => (
                  <RdvRow
                    key={rdv.sf_event_id}
                    rdv={rdv}
                    expanded={expandedId === rdv.sf_event_id}
                    onExpand={() => handleExpand(rdv)}
                    formStatus={formStatus}
                    formNotes={formNotes}
                    formNewDate={formNewDate}
                    formNewTime={formNewTime}
                    saving={saving}
                    saveError={saveError}
                    sfWarning={sfWarning}
                    onStatusChange={setFormStatus}
                    onNotesChange={setFormNotes}
                    onNewDateChange={setFormNewDate}
                    onNewTimeChange={setFormNewTime}
                    onSubmit={() => void handleSubmit(rdv)}
                  />
                ))}
              </section>
            ))}

            {/* Empty state — composant standard */}
            {!error && !hasData && (
              <EmptyState
                title={`Aucun RDV ${period === 'week' ? 'cette semaine' : period === 'month' ? 'ce mois' : ''}`}
                description={
                  period === 'all'
                    ? 'Les RDV créés dans Combo ou Salesforce apparaîtront ici.'
                    : "Changez de période ou créez un RDV depuis une session d'appel."
                }
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Row component ───────────────────────────────────────────────────────────

type RdvRowProps = {
  rdv: RdvSuiviItem;
  expanded: boolean;
  onExpand: () => void;
  formStatus: FormStatus;
  formNotes: string;
  formNewDate: string;
  formNewTime: string;
  saving: boolean;
  saveError: string | null;
  sfWarning: string | null;
  onStatusChange: (s: FormStatus) => void;
  onNotesChange: (v: string) => void;
  onNewDateChange: (v: string) => void;
  onNewTimeChange: (v: string) => void;
  onSubmit: () => void;
};

function RdvRow({
  rdv,
  expanded,
  onExpand,
  formStatus,
  formNotes,
  formNewDate,
  formNewTime,
  saving,
  saveError,
  sfWarning,
  onStatusChange,
  onNotesChange,
  onNewDateChange,
  onNewTimeChange,
  onSubmit,
}: RdvRowProps) {
  const isPast = dayKey(rdv.start) < todayParisIso();
  const needsAttention = isPast && rdv.status === 'a_venir';
  const isReport = formStatus === REPORT_ACTION;
  const reportDisabled = isReport && !formNewDate;

  return (
    <div
      className={`rdv-row ${expanded ? 'rdv-row--expanded' : ''} ${needsAttention ? 'rdv-row--attention' : ''}`}
    >
      <button type="button" className="rdv-row__main" onClick={onExpand}>
        <span className="rdv-row__time">{formatTime(rdv.start)}</span>
        <span className="rdv-row__contact">{rdv.contact_name || '—'}</span>
        <span className="rdv-row__account">{rdv.account_name || ''}</span>
        <span className="rdv-row__subject">{rdv.subject}</span>
        {rdv.via_combo && <span className="rdv-row__badge">Combo</span>}
        <span
          className="rdv-row__status"
          style={{ color: STATUS_COLORS[rdv.status] }}
        >
          {STATUS_LABELS[rdv.status]}
        </span>
      </button>

      {expanded && (
        <div className="rdv-row__detail">
          <div className="rdv-row__status-picker">
            {STATUS_ACTIONS.map((action) => (
              <button
                key={action.value}
                type="button"
                className={`rdv-row__status-btn ${formStatus === action.value ? 'rdv-row__status-btn--active' : ''}`}
                style={
                  { '--rdv-btn-color': action.color } as React.CSSProperties
                }
                onClick={() => onStatusChange(action.value)}
              >
                {action.label}
              </button>
            ))}
          </div>

          {isReport && (
            <div className="rdv-row__reschedule">
              <DatePicker
                label="Nouvelle date"
                value={formNewDate}
                onChange={onNewDateChange}
              />
              <TimePicker
                label="Heure"
                value={formNewTime}
                onChange={onNewTimeChange}
              />
            </div>
          )}

          <textarea
            className="calls-textarea rdv-row__notes"
            placeholder="Compte-rendu du RDV…"
            value={formNotes}
            onChange={(e) => onNotesChange(e.target.value)}
            rows={3}
          />

          {saveError && (
            <p className="rdv-row__error" role="alert">
              {saveError}
            </p>
          )}
          {sfWarning && (
            <p className="rdv-row__warning" role="status">
              {sfWarning}
            </p>
          )}

          <div className="rdv-row__actions">
            <Button
              size="sm"
              onClick={onSubmit}
              disabled={saving || reportDisabled}
            >
              {saving
                ? 'Enregistrement…'
                : isReport
                  ? 'Reporter le RDV'
                  : 'Enregistrer'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
