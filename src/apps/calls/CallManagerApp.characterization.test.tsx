// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSession } from '../../auth/useSession';
import type { SessionContact, SessionDetail } from './types';
import {
  jsonResponse,
  makeContext,
  makeContact,
  makeHubPayload,
  makeSession,
  makeTeamMember,
  requestAction,
} from './modules/runner/runnerCharacterizationFixtures';
import { invalidateComboHubCache } from './api';

const mockSession = {
  user: { id: 'user-1', email: 'characterization@example.test' },
  access_token: 'characterization-token',
};

function mockSessionState() {
  vi.mocked(useSession).mockReturnValue({
    session: mockSession,
    loading: false,
    bridgeError: false,
  } as ReturnType<typeof useSession>);
}

vi.mock('../../auth/useSession', () => ({
  useSession: vi.fn(() => ({
    session: mockSession,
    loading: false,
    bridgeError: false,
  })),
}));

vi.mock('../../os/shortcuts', () => ({
  addShortcut: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({ data: { role: 'commercial' }, error: null }),
        }),
      }),
    }),
  },
}));

import CallManagerApp from './CallManagerApp';

type TestSessionState = {
  session: SessionDetail;
  contacts: SessionContact[];
};

type RequestRecord = ReturnType<typeof requestAction>;

type RouterOptions = TestSessionState & {
  sessionResponses?: TestSessionState[];
  contextFor?: (contactId: number) => ReturnType<typeof makeContext>;
  onAction?: (request: RequestRecord) => Response | Promise<Response>;
};

function installLocalStorage() {
  const store: Record<string, string> = {};
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = String(value);
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        for (const key of Object.keys(store)) delete store[key];
      },
    },
  });
}

function installRunnerApi(options: RouterOptions) {
  const requests: RequestRecord[] = [];
  const contextUrls: string[] = [];
  const sessionResponses = [
    ...(options.sessionResponses ?? [options]),
  ];
  const hub = makeHubPayload();
  const config = {
    env: 'test',
    is_dry_run: true,
    has_caller_id: false,
    has_connection_id: false,
    has_webhook_public_key: false,
    caller_numbers: [],
    entitlement: {
      enabled: false,
      dry_run: true,
      calls_day_limit: 50,
      calls_today: 0,
    },
    flags: {
      enabled: false,
      dry_run: true,
      budget_session_cents: 0,
      budget_user_day_cents: 0,
      budget_org_month_cents: 0,
      rate_rps: 0,
      rate_burst: 0,
    },
  };

  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const request = requestAction(input, init);
    requests.push(request);

    if (request.url === '/api/calls?resource=hub') {
      return Promise.resolve(jsonResponse(hub));
    }
    if (request.url === '/api/calls?resource=team') {
      return Promise.resolve(
        jsonResponse({
          team: [
            makeTeamMember({
              user_id: 'user-1',
              label: 'Utilisateur de test',
            }),
          ],
        }),
      );
    }
    if (request.url === '/api/dialer?resource=config') {
      return Promise.resolve(jsonResponse(config));
    }
    if (request.url.includes('context_contact_id=')) {
      const parsed = new URL(request.url, 'https://characterization.test');
      const contactId = Number(parsed.searchParams.get('context_contact_id'));
      contextUrls.push(request.url);
      return Promise.resolve(
        jsonResponse({
          context: options.contextFor?.(contactId) ?? makeContext(),
        }),
      );
    }
    if (request.url === '/api/calls?session_id=1') {
      const response =
        sessionResponses.length > 1
          ? sessionResponses.shift()!
          : sessionResponses[0]!;
      return Promise.resolve(jsonResponse(response));
    }
    if (request.url === '/api/calls' && request.method === 'POST') {
      return Promise.resolve(
        options.onAction?.(request) ?? jsonResponse({ ok: true }),
      );
    }
    return Promise.resolve(jsonResponse({ error: 'not_found' }, 404));
  });

  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, requests, contextUrls };
}

function actionBodies(requests: RequestRecord[], action: string) {
  return requests
    .map((request) => request.body)
    .filter(
      (body): body is Record<string, unknown> => body?.action === action,
    );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  invalidateComboHubCache();
});

beforeEach(() => {
  installLocalStorage();
  window.localStorage.setItem('xos-combo-demo-seen', '1');
  window.localStorage.setItem('xos-combo-sounds', '0');
  mockSessionState();
  invalidateComboHubCache();
});

describe('CallManagerApp — caractérisation du runner legacy', () => {
  it('claims a focused pending contact exactly once', async () => {
    const session = makeSession();
    const contacts = [makeContact(1)];
    const router = installRunnerApi({ session, contacts });

    render(<CallManagerApp params={{ session_id: '1' }} />);
    await screen.findByRole('heading', { name: session.name });

    await waitFor(() => {
      expect(actionBodies(router.requests, 'claim_contact')).toHaveLength(1);
    });
    await waitFor(() => {
      expect(actionBodies(router.requests, 'claim_contact')[0]).toMatchObject({
        session_id: 1,
        contact_id: 1,
      });
    });
    expect(actionBodies(router.requests, 'claim_contact')).toHaveLength(1);
  });

  it('keeps a contact claimed by another user out of the actionable focus', async () => {
    const session = makeSession();
    const shared = makeContact(9, {
      contact_name: 'Contact partagé',
      claim_active: true,
      claimed_by: 'other-user',
      claimed_by_label: 'Camille',
    });
    const own = makeContact(10, { contact_name: 'Contact disponible' });
    const router = installRunnerApi({ session, contacts: [shared, own] });
    const user = userEvent.setup();

    render(<CallManagerApp params={{ session_id: '1' }} />);
    await screen.findByRole('heading', { name: session.name });
    await user.click(screen.getByRole('button', { name: 'Liste' }));

    expect(screen.getByText('Pris · Camille')).toBeTruthy();
    await user.click(
      screen.getByRole('button', { name: 'Contact partagé' }),
    );
    await screen.findByRole('heading', { name: 'Contact partagé' });

    await waitFor(() => {
      expect(
        actionBodies(router.requests, 'claim_contact').map(
          (body) => body.contact_id,
        ),
      ).not.toContain(9);
    });
    expect(
      actionBodies(router.requests, 'claim_contact').map(
        (body) => body.contact_id,
      ),
    ).toEqual([10]);
  });

  it('prefetches the current context and the next three pending contacts', async () => {
    const session = makeSession();
    const contacts = [
      makeContact(1),
      makeContact(2, { status: 'called', outcome: 'Appel décroché' }),
      makeContact(3),
      makeContact(4),
      makeContact(5),
      makeContact(6),
    ];
    const router = installRunnerApi({ session, contacts });

    render(<CallManagerApp params={{ session_id: '1' }} />);
    await screen.findByRole('heading', { name: session.name });

    await waitFor(() => {
      const ids = router.contextUrls.map((url) =>
        Number(
          new URL(url, 'https://characterization.test').searchParams.get(
            'context_contact_id',
          ),
        ),
      );
      expect(new Set(ids)).toEqual(new Set([1, 3, 4, 5]));
    });
    expect(router.contextUrls.filter((url) => url.includes('context_lite=1')))
      .not.toHaveLength(0);
  });

  it('rolls back the optimistic log when Salesforce rejects it', async () => {
    const session = makeSession();
    const contacts = [makeContact(1)];
    const pendingLogCall = {
      resolve: null as ((response: Response) => void) | null,
    };
    const router = installRunnerApi({
      session,
      contacts,
      onAction: (request) => {
        if (request.body?.action !== 'log_call') return jsonResponse({ ok: true });
        return new Promise<Response>((resolve) => {
          pendingLogCall.resolve = resolve;
        });
      },
    });
    const user = userEvent.setup();

    render(<CallManagerApp params={{ session_id: '1' }} />);
    await screen.findByRole('heading', { name: session.name });
    await user.click(screen.getByRole('button', { name: 'Consigner & suivant' }));
    await waitFor(() => {
      expect(actionBodies(router.requests, 'log_call')).toHaveLength(1);
    });

    await user.click(screen.getByRole('button', { name: 'Liste' }));
    expect(screen.getByText('Appel non décroché')).toBeTruthy();
    pendingLogCall.resolve?.(
      new Response(JSON.stringify({ error: 'sf_write_error' }), {
        status: 502,
      }),
    );

    expect(
      (await screen.findByRole('alert')).textContent,
    ).toContain("Salesforce a refusé l'enregistrement");
    expect(screen.getByTitle('À faire')).toBeTruthy();
  });

  it('keeps successive Consigner & suivant submissions FIFO', async () => {
    const session = makeSession();
    const contacts = [makeContact(1), makeContact(2)];
    const completedContacts = contacts.map((contact) => ({
      ...contact,
      status: 'called' as const,
      outcome: 'Appel non décroché' as const,
    }));
    const resolvers: Array<(response: Response) => void> = [];
    const router = installRunnerApi({
      session,
      contacts,
      sessionResponses: [
        { session, contacts },
        { session: { ...session, status: 'completed' }, contacts: completedContacts },
      ],
      onAction: (request) => {
        if (request.body?.action !== 'log_call') return jsonResponse({ ok: true });
        return new Promise<Response>((resolve) => resolvers.push(resolve));
      },
    });
    const user = userEvent.setup();

    render(<CallManagerApp params={{ session_id: '1' }} />);
    await screen.findByRole('heading', { name: session.name });
    await user.click(screen.getByRole('button', { name: 'Consigner & suivant' }));
    await waitFor(() => expect(resolvers).toHaveLength(1));

    await screen.findByRole('heading', { name: 'Contact 2' });
    await user.click(screen.getByRole('button', { name: 'Consigner & suivant' }));
    expect(resolvers).toHaveLength(1);

    resolvers[0]!(jsonResponse({ ok: true }));
    await waitFor(() => expect(resolvers).toHaveLength(2));
    expect(actionBodies(router.requests, 'log_call').map((body) => body.contact_id))
      .toEqual([1, 2]);

    resolvers[1]!(jsonResponse({ ok: true }));
    await screen.findByText('Terminée');
  });

  it('keeps a rejected RDV event visible for finalisation', async () => {
    const session = makeSession();
    const contacts = [makeContact(1)];
    const eventPending = makeContact(1, {
      status: 'called',
      outcome: 'RDV planifié',
      sf_event_id: null,
    });
    const actions: string[] = [];
    const router = installRunnerApi({
      session,
      contacts,
      sessionResponses: [
        { session, contacts },
        { session, contacts: [eventPending] },
      ],
      onAction: (request) => {
        const action = request.body?.action;
        if (typeof action === 'string') actions.push(action);
        if (action === 'log_call') return jsonResponse({ ok: true, needs_event: true });
        if (action === 'log_event') {
          return jsonResponse({ error: 'sf_write_error' }, 502);
        }
        return jsonResponse({ ok: true });
      },
    });
    const user = userEvent.setup();

    render(<CallManagerApp params={{ session_id: '1' }} />);
    await screen.findByRole('heading', { name: session.name });
    await user.click(screen.getByRole('button', { name: 'RDV planifié' }));
    await screen.findByRole('heading', { name: 'Détails du RDV' });
    await user.click(
      screen.getByRole('button', {
        name: 'Consigner appel + RDV & suivant',
      }),
    );

    await waitFor(() => expect(actions).toContain('log_event'));
    await screen.findByRole('heading', {
      name: 'Finaliser le RDV — Contact 1',
    });
    expect((await screen.findByRole('alert')).textContent).toContain(
      "Salesforce a refusé l'enregistrement",
    );
    expect(actions).toEqual(['claim_contact', 'log_call', 'log_event']);
    expect(router.requests.some((request) => request.url === '/api/calls?session_id=1'))
      .toBe(true);
  });
});
