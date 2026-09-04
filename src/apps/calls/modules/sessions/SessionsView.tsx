import { useMemo, useState, type KeyboardEvent, type MouseEvent } from 'react';
import {
  Button,
  EmptyState,
  Modal,
  ProgressBar,
  Skeleton,
  Tag,
} from '../../../../components/ui';
import { DatePicker, SessionTypePicker } from '../../formControls';
import { todayParisIso } from '../../formControls.helpers';
import type {
  CallStats,
  PeriodKpis,
  SessionSummary,
  SessionType,
} from '../../types';
import { sessionTypeLabel } from '../../types';
import { sessionDayKey } from './sessionLifecycle';

type SessionsViewProps = {
  sessions: SessionSummary[];
  stats: CallStats | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onNewSession: () => void;
  onOpenSession: (sessionId: number, contactId?: number) => void;
  onUpdateSession: (
    sessionId: number,
    patch: {
      name?: string;
      scheduled_for?: string | null;
      session_type?: SessionType;
    },
  ) => Promise<void>;
  onDeleteSession: (sessionId: number) => Promise<void>;
  onShareSession?: (sessionId: number) => void;
};

function emptyKpis(): PeriodKpis {
  return {
    calls: 0,
    decroche: 0,
    argumente: 0,
    rdv: 0,
    npa: 0,
    rate_decroche: 0,
    rate_argumente: 0,
    rate_rdv_per_decroche: 0,
    rate_rdv_per_argumente: 0,
  };
}

function pct(value: number): string {
  return `${value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatScheduledDate(value: string): string {
  return new Date(`${value}T12:00:00`).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function compareSessionDates(a: SessionSummary, b: SessionSummary): number {
  return (
    sessionDayKey(a).localeCompare(sessionDayKey(b)) ||
    a.created_at.localeCompare(b.created_at) ||
    a.id - b.id
  );
}

/** Active sessions first, in chronological order; completed sessions last, newest first. */
function sortSessions(list: SessionSummary[]): SessionSummary[] {
  return [...list].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
    const byDate = compareSessionDates(a, b);
    return a.status === 'active' ? byDate : -byDate;
  });
}

function heroPriority(session: SessionSummary, today: string): number {
  if (
    session.status === 'active' &&
    sessionDayKey(session) === today &&
    session.pending > 0
  ) {
    return 0;
  }
  if (session.status === 'active' && sessionDayKey(session) < today) {
    return 1;
  }
  return 2;
}

/** Pick the session the user can act on now, without adding a hub API call. */
function selectHeroSession(
  sessions: SessionSummary[],
  today: string,
): SessionSummary | null {
  return (
    [...sessions]
      .filter((session) => session.status === 'active')
      .sort((a, b) => {
        const byPriority = heroPriority(a, today) - heroPriority(b, today);
        return byPriority || compareSessionDates(a, b);
      })[0] ?? null
  );
}

function heroContext(session: SessionSummary, today: string): string {
  if (heroPriority(session, today) === 0) return "À appeler aujourd'hui";
  if (heroPriority(session, today) === 1) return 'Séance en retard';
  return 'Prochaine séance';
}

function sessionStatusLabel(session: SessionSummary, today?: string): string {
  if (session.status === 'completed') return 'Terminée';
  if (today && session.scheduled_for && session.scheduled_for > today) {
    return 'Planifiée';
  }
  return session.pending > 0 ? 'En cours' : 'Prête';
}

function SessionsSkeleton() {
  return (
    <div className="calls-home-skeleton" aria-label="Chargement des séances">
      <section className="calls-hero calls-hero--skeleton" aria-hidden="true">
        <Skeleton width="7rem" height="0.8rem" />
        <Skeleton width="min(24rem, 70%)" height="2rem" />
        <Skeleton width="14rem" height="1rem" />
        <Skeleton width="7rem" height="2.5rem" />
      </section>
      <section
        className="calls-week-kpis calls-week-kpis--skeleton"
        aria-hidden="true"
      >
        <Skeleton width="8rem" height="1.1rem" />
        <div className="calls-week-kpis__grid">
          <Skeleton height="5.5rem" />
          <Skeleton height="5.5rem" />
          <Skeleton height="5.5rem" />
        </div>
      </section>
      <section
        className="calls-home-section calls-home-section--skeleton"
        aria-hidden="true"
      >
        <Skeleton width="9rem" height="1.1rem" />
        <Skeleton height="6rem" />
        <Skeleton height="6rem" />
      </section>
    </div>
  );
}

export function SessionsView({
  sessions,
  stats,
  loading,
  error,
  onRefresh,
  onNewSession,
  onOpenSession,
  onUpdateSession,
  onDeleteSession,
  onShareSession,
}: SessionsViewProps) {
  const today = todayParisIso();
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [editing, setEditing] = useState<SessionSummary | null>(null);
  const [editName, setEditName] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editType, setEditType] = useState<SessionType>('prospection');
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<SessionSummary | null>(
    null,
  );
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const kpis = stats?.week ?? emptyKpis();
  const sortedSessions = useMemo(() => sortSessions(sessions), [sessions]);
  const heroSession = useMemo(
    () => selectHeroSession(sessions, today),
    [sessions, today],
  );
  const showSkeleton = loading && sessions.length === 0;

  const openEdit = (session: SessionSummary, event: MouseEvent) => {
    event.stopPropagation();
    setOpenMenuId(null);
    setEditing(session);
    setEditName(session.name);
    setEditDate(session.scheduled_for ?? sessionDayKey(session));
    setEditType(session.session_type ?? 'prospection');
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await onUpdateSession(editing.id, {
        name: editName.trim(),
        scheduled_for: editDate || null,
        session_type: editType,
      });
      setEditing(null);
    } finally {
      setSaving(false);
    }
  };

  const requestDelete = (session: SessionSummary, event: MouseEvent) => {
    event.stopPropagation();
    setOpenMenuId(null);
    setPendingDelete(session);
  };

  const executeDelete = async () => {
    if (!pendingDelete) return;
    const session = pendingDelete;
    setDeletingId(session.id);
    try {
      await onDeleteSession(session.id);
      setPendingDelete(null);
    } finally {
      setDeletingId(null);
    }
  };

  const openSession = (sessionId: number) => onOpenSession(sessionId);

  const handleCardKeyDown = (
    sessionId: number,
    event: KeyboardEvent<HTMLElement>,
  ) => {
    if (event.target !== event.currentTarget) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    openSession(sessionId);
  };

  return (
    <div className="calls-view calls-hub">
      <header className="calls-view__header">
        <div>
          <h2>Séances</h2>
        </div>
        <div className="calls-view__actions">
          <Button variant="secondary" onClick={onRefresh} disabled={loading}>
            <span aria-hidden="true">⋯</span> Actualiser
          </Button>
          <Button onClick={onNewSession}>Nouvelle séance</Button>
        </div>
      </header>

      {error ? (
        <div className="calls-error" role="alert">
          <p>{error}</p>
          <Button variant="secondary" onClick={onRefresh}>
            Réessayer
          </Button>
        </div>
      ) : showSkeleton ? (
        <SessionsSkeleton />
      ) : (
        <>
          <section className="calls-hero" aria-label="Maintenant">
            {heroSession ? (
              <div className="calls-hero__content">
                <div className="calls-hero__copy">
                  <span className="calls-eyebrow">Maintenant</span>
                  <p className="calls-hero__context">
                    {heroContext(heroSession, today)}
                  </p>
                  <h3>{heroSession.name}</h3>
                  <p className="calls-hero__meta">
                    {heroSession.pending > 0
                      ? `${heroSession.pending} contact${heroSession.pending > 1 ? 's' : ''} à appeler`
                      : 'Séance prête à reprendre'}
                  </p>
                </div>
                <div className="calls-hero__action">
                  <Tag variant="accent">
                    {sessionStatusLabel(heroSession, today)}
                  </Tag>
                  <Button onClick={() => openSession(heroSession.id)}>
                    Ouvrir
                  </Button>
                </div>
              </div>
            ) : (
              <EmptyState
                title="Créez une séance pour appeler."
                description="Préparez une liste de contacts et lancez votre prochaine séance depuis Combo."
                action={
                  <Button onClick={onNewSession}>Créer une séance</Button>
                }
              />
            )}
          </section>

          <section className="calls-week-kpis" aria-label="Cette semaine">
            <div className="calls-section-heading">
              <div>
                <span className="calls-eyebrow">Repères</span>
                <h3>Cette semaine</h3>
              </div>
            </div>
            <div className="calls-week-kpis__grid">
              <article className="calls-kpi">
                <span className="calls-kpi__label">Appels</span>
                <strong className="xos-numeric">{kpis.calls}</strong>
                <span className="calls-kpi__secondary">Appels passés</span>
              </article>
              <article className="calls-kpi">
                <span className="calls-kpi__label">Décrochés</span>
                <strong className="xos-numeric">{kpis.decroche}</strong>
                <span className="calls-kpi__secondary">
                  {pct(kpis.rate_decroche)} des appels
                </span>
              </article>
              <article className="calls-kpi">
                <span className="calls-kpi__label">RDV</span>
                <strong className="xos-numeric">{kpis.rdv}</strong>
                <span className="calls-kpi__secondary">
                  {pct(kpis.rate_rdv_per_decroche)} des décrochés
                </span>
              </article>
            </div>
          </section>

          {sortedSessions.length > 0 ? (
            <section className="calls-home-section" aria-label="Séances">
              <div className="calls-section-heading">
                <div>
                  <span className="calls-eyebrow">Bibliothèque</span>
                  <h3>Vos séances</h3>
                </div>
                <span className="calls-section-heading__count xos-numeric">
                  {sortedSessions.length}
                </span>
              </div>
              <ul className="calls-session-list">
                {sortedSessions.map((session) => {
                  const menuOpen = openMenuId === session.id;
                  return (
                    <li key={session.id}>
                      <article
                        className={`calls-session-card calls-session-card--${session.session_type}${session.status === 'completed' ? ' calls-session-card--done' : ''}`}
                        role="button"
                        tabIndex={0}
                        aria-label={`Ouvrir ${session.name}`}
                        onClick={() => openSession(session.id)}
                        onKeyDown={(event) =>
                          handleCardKeyDown(session.id, event)
                        }
                      >
                        <div className="calls-session-card__body">
                          <div className="calls-session-card__top">
                            <div className="calls-session-card__title">
                              <strong>{session.name}</strong>
                              <span className="calls-session-card__date">
                                {session.scheduled_for
                                  ? `Séance du ${formatScheduledDate(session.scheduled_for)}`
                                  : formatDate(session.created_at)}
                              </span>
                            </div>
                            <div className="calls-session-card__tags">
                              <Tag variant="muted">
                                {sessionTypeLabel(session.session_type)}
                              </Tag>
                              <Tag
                                variant={
                                  session.status === 'active'
                                    ? 'accent'
                                    : 'default'
                                }
                              >
                                {sessionStatusLabel(session, today)}
                              </Tag>
                              {session.shared ? (
                                <Tag variant="muted">Partagée</Tag>
                              ) : null}
                              {session.is_owner === false ? (
                                <Tag variant="muted">Invité</Tag>
                              ) : null}
                            </div>
                          </div>
                          <ProgressBar
                            called={session.called}
                            total={session.total}
                            label={`Progression de ${session.name} : ${session.called} sur ${session.total}`}
                          />
                        </div>

                        <div
                          className="calls-session-card__menu"
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => event.stopPropagation()}
                        >
                          <Button
                            variant="icon"
                            size="sm"
                            type="button"
                            aria-label={`Actions pour ${session.name}`}
                            aria-haspopup="menu"
                            aria-expanded={menuOpen}
                            onClick={() =>
                              setOpenMenuId(menuOpen ? null : session.id)
                            }
                          >
                            ⋯
                          </Button>
                          {menuOpen ? (
                            <div
                              className="calls-session-card__menu-popover"
                              role="menu"
                              aria-label={`Actions de ${session.name}`}
                            >
                              {session.is_owner !== false && onShareSession ? (
                                <Button
                                  variant="ghost"
                                  role="menuitem"
                                  onClick={() => {
                                    setOpenMenuId(null);
                                    onShareSession(session.id);
                                  }}
                                >
                                  Partager
                                </Button>
                              ) : null}
                              <Button
                                variant="ghost"
                                role="menuitem"
                                onClick={(event) => openEdit(session, event)}
                              >
                                Modifier
                              </Button>
                              <Button
                                variant="ghost"
                                role="menuitem"
                                onClick={(event) =>
                                  requestDelete(session, event)
                                }
                                disabled={deletingId === session.id}
                              >
                                {deletingId === session.id
                                  ? 'Suppression…'
                                  : 'Supprimer'}
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      </article>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </>
      )}

      {editing ? (
        <Modal
          open
          title="Modifier la séance"
          onClose={() => !saving && setEditing(null)}
        >
          <label className="calls-field">
            <span>Nom</span>
            <input
              className="calls-input"
              value={editName}
              onChange={(event) => setEditName(event.target.value)}
              autoFocus
            />
          </label>
          <DatePicker label="Date" value={editDate} onChange={setEditDate} />
          <SessionTypePicker value={editType} onChange={setEditType} />
          <div className="calls-runner-actions">
            <Button
              onClick={() => void saveEdit()}
              disabled={saving || !editName.trim()}
            >
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => setEditing(null)}
              disabled={saving}
            >
              Annuler
            </Button>
          </div>
        </Modal>
      ) : null}

      {pendingDelete ? (
        <Modal
          open
          title="Supprimer la séance"
          onClose={() => deletingId == null && setPendingDelete(null)}
        >
          <p className="calls-muted">
            Supprimer « <strong>{pendingDelete.name}</strong> » ? Cette action
            est irréversible.
          </p>
          <div className="calls-runner-actions">
            <Button
              onClick={() => void executeDelete()}
              disabled={deletingId === pendingDelete.id}
            >
              {deletingId === pendingDelete.id ? 'Suppression…' : 'Supprimer'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => setPendingDelete(null)}
              disabled={deletingId === pendingDelete.id}
            >
              Annuler
            </Button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
