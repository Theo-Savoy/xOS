import type {
  ContactContext,
  SessionContact,
  SessionDetail,
  SessionSummary,
  TeamMember,
} from '../../types';

export const CHARACTERIZATION_TOKEN = 'characterization-token';
export const CHARACTERIZATION_USER_ID = 'characterization-user';

export function makeSession(
  overrides: Partial<SessionDetail> = {},
): SessionDetail {
  return {
    id: 1,
    name: 'Séance de caractérisation',
    status: 'active',
    created_at: '2026-09-04T09:00:00Z',
    scheduled_for: '2026-09-04',
    session_type: 'prospection',
    rdv_goal: null,
    engaged_at: '2026-09-04T09:01:00Z',
    ...overrides,
  };
}

export function makeContact(
  id: number,
  overrides: Partial<SessionContact> = {},
): SessionContact {
  return {
    id,
    position: id - 1,
    sf_contact_id: `003-characterization-${id}`,
    sf_account_id: '001-characterization-account',
    contact_name: `Contact ${id}`,
    account_name: 'Compte de caractérisation',
    phone: `+331000000${String(id).padStart(2, '0')}`,
    email: `contact-${id}@example.test`,
    title: 'Responsable',
    linkedin_url: null,
    status: 'pending',
    outcome: null,
    comments: null,
    sf_task_id: null,
    sf_event_id: null,
    called_at: null,
    recall_at: null,
    attempt_count: 0,
    marked_npa: false,
    claim_active: false,
    claimed_by: null,
    claimed_at: null,
    claimed_by_label: null,
    ...overrides,
  };
}

export function makeContext(
  overrides: Partial<ContactContext> = {},
): ContactContext {
  return {
    contact_record_url: null,
    account_record_url: null,
    email: null,
    title: null,
    account_name: 'Compte de caractérisation',
    account_customer_type: 'Prospect',
    account_owner_sf_user_id: null,
    industry: 'Services',
    peer_clients: [],
    npa: false,
    tasks: [],
    opportunities: [],
    events: [],
    ...overrides,
  };
}

export function makeTeamMember(
  overrides: Partial<TeamMember> = {},
): TeamMember {
  return {
    user_id: 'sales-user',
    label: 'Sales User',
    sf_user_id: '005-characterization-sales',
    ...overrides,
  };
}

export function makeSessionSummary(
  overrides: Partial<SessionSummary> = {},
): SessionSummary {
  return {
    id: 1,
    name: 'Séance de caractérisation',
    status: 'active',
    created_at: '2026-09-04T09:00:00Z',
    scheduled_for: '2026-09-04',
    session_type: 'prospection',
    total: 3,
    called: 0,
    skipped: 0,
    pending: 3,
    ...overrides,
  };
}

export function makeHubPayload(
  overrides: Partial<{
    sessions: SessionSummary[];
    recall_count: number;
  }> = {},
) {
  return {
    sessions: overrides.sessions ?? [makeSessionSummary()],
    stats: {
      calls_today: 0,
      calls_week: 0,
      sessions_active: 1,
      sessions_completed: 0,
    },
    recall_count: overrides.recall_count ?? 0,
  };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function requestAction(input: RequestInfo | URL, init?: RequestInit) {
  const url = String(input);
  let body: Record<string, unknown> | null = null;
  if (init?.body) {
    body = JSON.parse(String(init.body)) as Record<string, unknown>;
  }
  return {
    url,
    method: init?.method ?? 'GET',
    body,
    action: typeof body?.action === 'string' ? body.action : null,
  };
}
