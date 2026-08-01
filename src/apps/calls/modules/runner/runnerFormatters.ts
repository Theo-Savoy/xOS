import {
  DEFAULT_RECALL_DAYS,
  PIPE_ARGUMENTE,
  PIPE_DECROCHE,
} from '../../../../crm';
import { todayParisIso } from '../../formControls.helpers';
import type {
  ContactEventItem,
  ContactOpportunityItem,
  SessionContact,
} from '../../types';

export const RECALL_DAYS_KEY = 'xos-calls-default-recall-days';

export function addDaysIso(days: number): string {
  const [y, m, d] = todayParisIso().split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

export function readDefaultRecallDays(): number {
  try {
    const raw = localStorage.getItem(RECALL_DAYS_KEY);
    const value = raw ? Number(raw) : DEFAULT_RECALL_DAYS;
    return Number.isInteger(value) && value >= 0 && value <= 90
      ? value
      : DEFAULT_RECALL_DAYS;
  } catch {
    return DEFAULT_RECALL_DAYS;
  }
}

/** `completedAttempts` = appels déjà journalisés ; on affiche le n° de la prochaine tentative. */
export function formatAttemptLabel(completedAttempts: number): string {
  const next = Math.max(1, completedAttempts + 1);
  if (next === 1) return '1re tentative';
  return `${next}e tentative`;
}

export function formatPreviousCallersBadge(
  previousCallers: SessionContact['previous_callers'],
): string | null {
  if (!previousCallers || previousCallers.length === 0) return null;
  const [last] = previousCallers;
  const relative = formatRelativeDaysFr(last.called_at);
  const outcome = last.outcome ?? '—';
  const prefix =
    previousCallers.length === 1
      ? 'Tenté 1 fois'
      : `Tenté ${previousCallers.length} fois · dernier`;
  return `${prefix} · ${last.user_label} il y a ${relative} · ${outcome}`;
}

export function formatRelativeDaysFr(
  iso: string | null | undefined,
  today = todayParisIso(),
): string {
  const value = String(iso ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !/^\d{4}-\d{2}-\d{2}$/.test(today))
    return '';
  const from = new Date(`${value}T12:00:00Z`).getTime();
  const to = new Date(`${today}T12:00:00Z`).getTime();
  const days = Math.max(0, Math.round((to - from) / 86_400_000));
  if (days === 0) return 'aujourd’hui';
  if (days === 1) return 'hier';
  return `il y a ${days} j`;
}

export function sortOpportunities(
  opportunities: ContactOpportunityItem[],
): ContactOpportunityItem[] {
  return [...opportunities].sort((a, b) => {
    const link =
      Number(Boolean(b.linked_to_contact)) -
      Number(Boolean(a.linked_to_contact));
    if (link !== 0) return link;
    return Number(a.is_closed) - Number(b.is_closed);
  });
}

export function sortEvents(events: ContactEventItem[]): ContactEventItem[] {
  return [...events].sort((a, b) => {
    const link =
      Number(Boolean(b.linked_to_contact)) -
      Number(Boolean(a.linked_to_contact));
    if (link !== 0) return link;
    return String(b.start_date_time || '').localeCompare(
      String(a.start_date_time || ''),
    );
  });
}

export function listStatusDisplay(contact: SessionContact): {
  label: string;
  variant: 'success' | 'warning' | 'accent' | 'muted' | 'default';
} {
  if (
    contact.status === 'pending' &&
    contact.claim_active &&
    contact.claimed_by_label
  ) {
    return { label: `Pris · ${contact.claimed_by_label}`, variant: 'warning' };
  }
  if (contact.status === 'pending')
    return { label: 'À faire', variant: 'accent' };
  if (contact.status === 'skipped')
    return { label: 'Non contacté', variant: 'warning' };
  if (contact.outcome === 'RDV planifié')
    return { label: contact.outcome, variant: 'success' };
  if (
    contact.outcome === 'Appel non décroché' ||
    contact.outcome === 'Message répondeur'
  ) {
    return { label: contact.outcome, variant: 'warning' };
  }
  if (contact.outcome) return { label: contact.outcome, variant: 'accent' };
  return { label: 'Appelé', variant: 'default' };
}

export function computeKpis(contacts: SessionContact[]) {
  const total = contacts.length;
  const remaining = contacts.filter((c) => c.status === 'pending').length;
  const calledRows = contacts.filter((c) => c.status === 'called');
  const called = calledRows.length;
  const decroches = calledRows.filter(
    (c) => c.outcome && PIPE_DECROCHE.includes(c.outcome),
  ).length;
  // Cohérence avec computeHubKpis (api/_calls/http.js) : un RDV planifié
  // est un appel argumenté qui a abouti, il doit compter dans les 2.
  const argumentes = calledRows.filter(
    (c) => c.outcome && PIPE_ARGUMENTE.includes(c.outcome),
  ).length;
  const rdv = calledRows.filter((c) => c.outcome === 'RDV planifié').length;
  return { total, remaining, called, decroches, argumentes, rdv };
}
