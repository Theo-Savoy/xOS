import { useMemo, useState } from 'react';
import { Button, Modal, Skeleton, Tag } from '../../../../components/ui';
import { todayParisIso } from '../../formControls.helpers';
import type { SessionSummary } from '../../types';
import { sessionTypeLabel } from '../../types';
import { sessionDayKey } from './sessionLifecycle';

type CalendarViewProps = {
  sessions: SessionSummary[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onNewSession: () => void;
  onOpenSession: (sessionId: number, contactId?: number) => void;
};

function buildMonthGrid(year: number, monthIndex: number): (Date | null)[] {
  const first = new Date(year, monthIndex, 1);
  const startPad = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(new Date(year, monthIndex, day));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function sortDaySessions(a: SessionSummary, b: SessionSummary): number {
  if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
  return a.created_at.localeCompare(b.created_at) || a.id - b.id;
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDayLabel(date: Date): string {
  return date.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

export function CalendarView({
  sessions,
  loading,
  error,
  onRefresh,
  onNewSession,
  onOpenSession,
}: CalendarViewProps) {
  const today = todayParisIso();
  const [calendarCursor, setCalendarCursor] = useState(() => {
    const [year, month] = today.split('-').map(Number);
    return { year, month: month - 1 };
  });
  const [dayOverflow, setDayOverflow] = useState<{
    key: string;
    sessions: SessionSummary[];
  } | null>(null);

  const sessionsByDay = useMemo(() => {
    const map = new Map<string, SessionSummary[]>();
    for (const session of sessions) {
      const key = sessionDayKey(session);
      if (!key) continue;
      const list = map.get(key) ?? [];
      list.push(session);
      map.set(key, list);
    }
    for (const list of map.values()) list.sort(sortDaySessions);
    return map;
  }, [sessions]);

  const monthCells = useMemo(
    () => buildMonthGrid(calendarCursor.year, calendarCursor.month),
    [calendarCursor],
  );
  const monthLabel = new Date(
    calendarCursor.year,
    calendarCursor.month,
    1,
  ).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  const jumpCalendarToday = () => {
    const [year, month] = today.split('-').map(Number);
    setCalendarCursor({ year, month: month - 1 });
  };

  const moveMonth = (delta: number) => {
    setCalendarCursor((cursor) => {
      const date = new Date(cursor.year, cursor.month + delta, 1);
      return { year: date.getFullYear(), month: date.getMonth() };
    });
  };

  return (
    <div className="calls-view calls-calendar-view" aria-busy={loading}>
      <header className="calls-view__header">
        <div>
          <h2>Calendrier</h2>
          <p className="calls-view__subtitle">
            Retrouvez vos séances par jour.
          </p>
        </div>
        <div className="calls-view__actions">
          <Button variant="secondary" onClick={onRefresh} disabled={loading}>
            Actualiser
          </Button>
          <Button onClick={onNewSession}>Nouvelle séance</Button>
        </div>
      </header>

      {error ? (
        <div className="calls-error calls-calendar__error" role="alert">
          <p>{error}</p>
          <Button variant="secondary" onClick={onRefresh}>
            Réessayer
          </Button>
        </div>
      ) : null}

      {loading && sessions.length === 0 ? (
        <div
          className="calls-calendar calls-calendar--loading"
          aria-label="Chargement du calendrier"
        >
          <Skeleton className="calls-calendar__skeleton" height={420} />
        </div>
      ) : !error ? (
        <section className="calls-calendar" aria-label="Calendrier des séances">
          <div className="calls-calendar__nav">
            <Button
              variant="secondary"
              aria-label="Mois précédent"
              onClick={() => moveMonth(-1)}
            >
              ←
            </Button>
            <div className="calls-calendar__heading">
              <h3 className="calls-calendar__title">{monthLabel}</h3>
              <Button
                variant="ghost"
                type="button"
                className="calls-calendar__today-btn"
                onClick={jumpCalendarToday}
              >
                Aujourd&apos;hui
              </Button>
            </div>
            <Button
              variant="secondary"
              aria-label="Mois suivant"
              onClick={() => moveMonth(1)}
            >
              →
            </Button>
          </div>
          <div className="calls-calendar__weekdays" aria-hidden="true">
            {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="calls-calendar__grid">
            {monthCells.map((date, index) => {
              if (!date) {
                return (
                  <div
                    key={`empty-${index}`}
                    className="calls-calendar__cell calls-calendar__cell--empty"
                    aria-hidden="true"
                  />
                );
              }
              const key = dateKey(date);
              const daySessions = sessionsByDay.get(key) ?? [];
              const isToday = key === today;
              return (
                <div
                  key={key}
                  className={`calls-calendar__cell${isToday ? ' calls-calendar__cell--today' : ''}${daySessions.length ? ' calls-calendar__cell--has' : ''}`}
                  role="group"
                  aria-label={formatDayLabel(date)}
                >
                  <span className="calls-calendar__day xos-numeric">
                    {date.getDate()}
                  </span>
                  <ul className="calls-calendar__events">
                    {daySessions.slice(0, 3).map((session) => (
                      <li key={session.id}>
                        <Button
                          variant="ghost"
                          type="button"
                          className={`calls-calendar__event calls-calendar__event--${session.session_type}`}
                          onClick={() => onOpenSession(session.id)}
                          title={session.name}
                        >
                          {session.name}
                        </Button>
                      </li>
                    ))}
                    {daySessions.length > 3 ? (
                      <li>
                        <Button
                          variant="ghost"
                          type="button"
                          className="calls-calendar__more"
                          aria-label={`+${daySessions.length - 3} autres séances le ${formatDayLabel(date)}`}
                          onClick={() =>
                            setDayOverflow({ key, sessions: daySessions })
                          }
                        >
                          +{daySessions.length - 3}
                        </Button>
                      </li>
                    ) : null}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {dayOverflow ? (
        <Modal
          open
          title={`Séances du ${new Date(
            `${dayOverflow.key}T12:00:00`,
          ).toLocaleDateString('fr-FR', {
            day: 'numeric',
            month: 'long',
          })}`}
          onClose={() => setDayOverflow(null)}
        >
          <ul className="calls-day-overflow-list">
            {dayOverflow.sessions.map((session) => (
              <li key={session.id}>
                <Button
                  variant="ghost"
                  type="button"
                  className="calls-day-overflow-list__item"
                  onClick={() => {
                    setDayOverflow(null);
                    onOpenSession(session.id);
                  }}
                >
                  <strong>{session.name}</strong>
                  <Tag variant="muted">
                    {sessionTypeLabel(session.session_type)}
                  </Tag>
                </Button>
              </li>
            ))}
          </ul>
          <Button variant="secondary" onClick={() => setDayOverflow(null)}>
            Fermer
          </Button>
        </Modal>
      ) : null}
    </div>
  );
}
