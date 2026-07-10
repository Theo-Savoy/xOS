import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  GET,
  POST,
  filterContactsForFollowUp,
  getFollowUpOutcomes,
  isValidEventStart,
} from "./calls.js";
import mapping from "./_crm/mapping.js";

const { mockVerifyJWT, mockFetchSFToken, mockLogCall, mockCreateEvent } = vi.hoisted(() => ({
  mockVerifyJWT: vi.fn(),
  mockFetchSFToken: vi.fn(),
  mockLogCall: vi.fn(),
  mockCreateEvent: vi.fn(),
}));

vi.mock("./_auth.js", () => ({
  verifyJWT: mockVerifyJWT,
  respond: (status, body) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
}));

vi.mock("./_crm/salesforce.js", () => ({
  fetchSFToken: mockFetchSFToken,
  logCall: mockLogCall,
  createEvent: mockCreateEvent,
}));

const mockSingle = vi.fn();
const mockMaybeSingle = vi.fn();

const mockChain = {
  then(onFulfilled, onRejected) {
    return Promise.resolve(mockSingle()).then(onFulfilled, onRejected);
  },
  select() { return this; },
  insert() { return this; },
  update() { return this; },
  delete() { return this; },
  eq() { return this; },
  in() { return this; },
  not() { return this; },
  order() { return this; },
  single() { return mockSingle(); },
  maybeSingle() { return mockMaybeSingle(); },
};

const mockFrom = vi.fn(() => mockChain);

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: mockFrom }),
}));

const RESULTS = mapping.objects.task.results;
const SEMANTIC = mapping.objects.task.resultSemantic;

function makeReq(method, body, url = "http://localhost/api/calls") {
  const headers = new Headers();
  headers.set("Authorization", "Bearer supabase-jwt-token");
  headers.set("Content-Type", "application/json");
  return new Request(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function makeRawReq(method, rawBody, url = "http://localhost/api/calls") {
  const headers = new Headers();
  headers.set("Authorization", "Bearer supabase-jwt-token");
  headers.set("Content-Type", "application/json");
  return new Request(url, { method, headers, body: rawBody });
}

const defaultUser = {
  id: "user-123",
  email: "test@xos-learning.fr",
  user_metadata: { full_name: "Jean Dupont" },
};

beforeEach(() => {
  vi.restoreAllMocks();
  mockSingle.mockReset();
  mockMaybeSingle.mockReset();
  mockFrom.mockClear();
  mockFetchSFToken.mockReset();
  mockLogCall.mockReset();
  mockCreateEvent.mockReset();

  vi.stubEnv("SUPABASE_URL", "https://test-supabase-url.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");

  mockVerifyJWT.mockResolvedValue(defaultUser);
  mockFetchSFToken.mockResolvedValue({ accessToken: "sf-token" });
  mockMaybeSingle.mockResolvedValue({
    data: { sf_user_id: "005000000000001AAA", full_name: "Jean Dupont" },
    error: null,
  });
  mockSingle.mockResolvedValue({ data: null, error: null });
});

describe("helpers", () => {
  it("getFollowUpOutcomes reads semantic mapping keys", () => {
    expect(getFollowUpOutcomes()).toEqual([
      SEMANTIC.followUpNoAnswer,
      SEMANTIC.followUpVoicemail,
    ]);
  });

  it("filterContactsForFollowUp keeps only relance outcomes", () => {
    const contacts = [
      { outcome: SEMANTIC.followUpNoAnswer },
      { outcome: SEMANTIC.followUpVoicemail },
      { outcome: "Appel décroché" },
      { outcome: SEMANTIC.rdv },
    ];
    expect(filterContactsForFollowUp(contacts)).toHaveLength(2);
  });

  it("isValidEventStart accepts ISO with Z or offset", () => {
    expect(isValidEventStart("2026-07-10T14:30:00Z")).toBe(true);
    expect(isValidEventStart("2026-07-10T14:30:00+02:00")).toBe(true);
    expect(isValidEventStart("")).toBe(false);
    expect(isValidEventStart("not-a-date")).toBe(false);
    expect(isValidEventStart("2026-07-10 14:30:00")).toBe(false);
  });
});

describe("GET /api/calls", () => {
  it("returns 401 when unauthorized", async () => {
    mockVerifyJWT.mockResolvedValue(null);
    const res = await GET(makeReq("GET", undefined));
    expect(res.status).toBe(401);
  });

  it("returns empty sessions list", async () => {
    mockSingle.mockResolvedValue({ data: [], error: null });
    const res = await GET(makeReq("GET", undefined));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessions).toEqual([]);
  });

  it("returns 400 for invalid session_id", async () => {
    const res = await GET(makeReq("GET", undefined, "http://localhost/api/calls?session_id=abc"));
    expect(res.status).toBe(400);
  });

  it("returns 404 when session not found", async () => {
    mockSingle.mockResolvedValue({ data: null, error: null });
    const res = await GET(makeReq("GET", undefined, "http://localhost/api/calls?session_id=1"));
    expect(res.status).toBe(404);
  });
});

describe("POST /api/calls", () => {
  it("returns 401 when unauthorized", async () => {
    mockVerifyJWT.mockResolvedValue(null);
    const res = await POST(makeReq("POST", { action: "create_session" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 on invalid action", async () => {
    const res = await POST(makeReq("POST", { action: "nonexistent" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_action");
  });

  describe("create_session", () => {
    it("creates session and contacts successfully", async () => {
      mockSingle
        .mockResolvedValueOnce({ data: { id: 12, name: "Prospection Lyon", status: "active", created_at: "2026-01-01T00:00:00Z" }, error: null })
        .mockResolvedValueOnce({
          data: [
            { id: 201, position: 0, sf_contact_id: "003000000000001", sf_account_id: "001000000000001", contact_name: "Marie Dupont", account_name: "ACME", phone: "+33...", status: "pending", outcome: null, comments: null, sf_task_id: null, sf_event_id: null, called_at: null },
          ],
          error: null,
        });

      const res = await POST(makeReq("POST", {
        action: "create_session",
        name: "Prospection Lyon",
        contacts: [
          { sf_contact_id: "003000000000001", sf_account_id: "001000000000001", contact_name: "Marie Dupont", account_name: "ACME", phone: "+33..." },
        ],
      }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.session.id).toBe(12);
      expect(body.contacts).toHaveLength(1);
    });

    it("returns 500 and compensates when contact insert fails", async () => {
      mockSingle
        .mockResolvedValueOnce({ data: { id: 12, name: "Prospection", status: "active", created_at: "2026-01-01T00:00:00Z" }, error: null })
        .mockResolvedValueOnce({ data: null, error: { message: "insert failed" } })
        .mockResolvedValueOnce({ data: null, error: null });

      const res = await POST(makeReq("POST", {
        action: "create_session",
        name: "Prospection",
        contacts: [{ sf_contact_id: "003000000000001", contact_name: "Marie" }],
      }));
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe("contacts_creation_failed");
    });
  });

  describe("log_call", () => {
    const sessionRow = { id: 1, owner: "user-123", name: "Test", status: "active" };
    const contactRow = { id: 101, session_id: 1, sf_contact_id: "003000000000001", sf_account_id: "001000000000001" };

    it("returns 400 for invalid resultat", async () => {
      const res = await POST(makeReq("POST", { action: "log_call", session_id: 1, contact_id: 1, resultat: "bad" }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("invalid_resultat");
    });

    it("returns 404 when session not found", async () => {
      mockSingle.mockResolvedValueOnce({ data: null, error: null });
      const res = await POST(makeReq("POST", { action: "log_call", session_id: 1, contact_id: 1, resultat: RESULTS[2] }));
      expect(res.status).toBe(404);
    });

    it("returns 500 on session lookup DB error", async () => {
      mockSingle.mockResolvedValueOnce({ data: null, error: { message: "db down" } });
      const res = await POST(makeReq("POST", { action: "log_call", session_id: 1, contact_id: 1, resultat: RESULTS[2] }));
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe("session_lookup_failed");
    });

    it("logs call via adapter and returns needs_event for RDV", async () => {
      mockSingle
        .mockResolvedValueOnce({ data: sessionRow, error: null })
        .mockResolvedValueOnce({ data: contactRow, error: null })
        .mockResolvedValueOnce({ data: null, error: null })
        .mockResolvedValueOnce({ data: null, error: null });

      mockLogCall.mockResolvedValue({ record: { id: "00T123" } });

      const res = await POST(makeReq("POST", {
        action: "log_call",
        session_id: 1,
        contact_id: 101,
        resultat: SEMANTIC.rdv,
        comments: "RDV fixé",
        duration_sec: 120,
      }));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.needs_event).toBe(true);
      expect(body.sf_task_id).toBe("00T123");
      expect(mockLogCall).toHaveBeenCalledWith(
        "sf-token",
        expect.objectContaining({
          contactId: "003000000000001",
          resultat: SEMANTIC.rdv,
          durationSec: 120,
          ownerId: "005000000000001AAA",
          actorName: "Jean Dupont",
        }),
        mapping,
      );
    });

    it("returns 500 when local persistence fails after SF success", async () => {
      mockSingle
        .mockResolvedValueOnce({ data: sessionRow, error: null })
        .mockResolvedValueOnce({ data: contactRow, error: null })
        .mockResolvedValueOnce({ data: null, error: { message: "update failed" } });

      mockLogCall.mockResolvedValue({ record: { id: "00T123" } });

      const res = await POST(makeReq("POST", {
        action: "log_call",
        session_id: 1,
        contact_id: 101,
        resultat: RESULTS[2],
      }));
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe("contact_update_failed");
      expect(body.sf_task_id).toBe("00T123");
    });

    it("returns 502 when Salesforce refuses logCall", async () => {
      mockSingle
        .mockResolvedValueOnce({ data: sessionRow, error: null })
        .mockResolvedValueOnce({ data: contactRow, error: null });

      mockLogCall.mockResolvedValue({ error: "sf_write_error", message: "OWNER_ID invalid" });

      const res = await POST(makeReq("POST", {
        action: "log_call",
        session_id: 1,
        contact_id: 101,
        resultat: RESULTS[0],
      }));
      expect(res.status).toBe(502);
      const body = await res.json();
      expect(body.error).toBe("sf_write_error");
    });
  });

  describe("log_event", () => {
    const sessionRow = { id: 1, owner: "user-123", name: "Test", status: "active" };
    const contactRow = { id: 101, session_id: 1, sf_contact_id: "003000000000001", sf_account_id: "001000000000001", contact_name: "Marie Dupont" };

    it("returns 400 for invalid start datetime", async () => {
      const res = await POST(makeReq("POST", {
        action: "log_event",
        session_id: 1,
        contact_id: 101,
        start: "tomorrow",
        duration_min: 30,
      }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("invalid_start");
    });

    it("creates event and persists sf_event_id", async () => {
      mockSingle
        .mockResolvedValueOnce({ data: sessionRow, error: null })
        .mockResolvedValueOnce({ data: contactRow, error: null })
        .mockResolvedValueOnce({ data: null, error: null })
        .mockResolvedValueOnce({ data: null, error: null });

      mockCreateEvent.mockResolvedValue({ record: { id: "00U456" } });

      const res = await POST(makeReq("POST", {
        action: "log_event",
        session_id: 1,
        contact_id: 101,
        start: "2026-07-15T10:00:00Z",
        duration_min: 45,
        invitees: ["005000000000002AAA"],
      }));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.sf_event_id).toBe("00U456");
      expect(mockCreateEvent).toHaveBeenCalledWith(
        "sf-token",
        expect.objectContaining({
          subject: "RDV — Marie Dupont",
          ownerId: "005000000000001AAA",
        }),
        mapping,
      );
    });

    it("returns 502 with sf_event_id on partial invitee failure", async () => {
      mockSingle
        .mockResolvedValueOnce({ data: sessionRow, error: null })
        .mockResolvedValueOnce({ data: contactRow, error: null })
        .mockResolvedValueOnce({ data: null, error: null })
        .mockResolvedValueOnce({ data: null, error: null });

      mockCreateEvent.mockResolvedValue({
        record: { id: "00U456" },
        inviteeError: "sf_write_error",
      });

      const res = await POST(makeReq("POST", {
        action: "log_event",
        session_id: 1,
        contact_id: 101,
        start: "2026-07-15T10:00:00Z",
        duration_min: 30,
      }));

      expect(res.status).toBe(502);
      const body = await res.json();
      expect(body.error).toBe("event_invitee_failed");
      expect(body.sf_event_id).toBe("00U456");
    });
  });

  describe("create_follow_up_session", () => {
    it("returns 400 when no relance contacts", async () => {
      mockSingle.mockResolvedValueOnce({ data: { id: 1, owner: "user-123", name: "Base", status: "active" }, error: null });
      mockSingle.mockResolvedValueOnce({ data: [{ outcome: "Appel décroché" }], error: null });

      const res = await POST(makeReq("POST", { action: "create_follow_up_session", session_id: 1 }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("no_follow_up_contacts");
    });

    it("creates relance session from follow-up outcomes", async () => {
      mockSingle
        .mockResolvedValueOnce({ data: { id: 1, owner: "user-123", name: "Base", status: "active" }, error: null })
        .mockResolvedValueOnce({
          data: [
            { sf_contact_id: "003000000000001", sf_account_id: null, contact_name: "Alice", account_name: null, phone: null, outcome: SEMANTIC.followUpNoAnswer },
          ],
          error: null,
        })
        .mockResolvedValueOnce({ data: { id: 20, name: "Relance — Base", status: "active", created_at: "2026-01-01T00:00:00Z" }, error: null })
        .mockResolvedValueOnce({
          data: [
            { id: 301, position: 0, sf_contact_id: "003000000000001", sf_account_id: null, contact_name: "Alice", account_name: null, phone: null, status: "pending", outcome: null, comments: null, sf_task_id: null, sf_event_id: null, called_at: null },
          ],
          error: null,
        });

      const res = await POST(makeReq("POST", { action: "create_follow_up_session", session_id: 1 }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.session.name).toBe("Relance — Base");
      expect(body.contacts).toHaveLength(1);
    });

    it("returns 500 when follow-up contact lookup fails", async () => {
      mockSingle
        .mockResolvedValueOnce({ data: { id: 1, owner: "user-123", name: "Base", status: "active" }, error: null })
        .mockResolvedValueOnce({ data: null, error: { message: "lookup failed" } });

      const res = await POST(makeReq("POST", { action: "create_follow_up_session", session_id: 1 }));
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe("session_contacts_lookup_failed");
    });
  });

  describe("skip_contact", () => {
    it("skips contact successfully", async () => {
      mockSingle
        .mockResolvedValueOnce({ data: { id: 1, owner: "user-123" }, error: null })
        .mockResolvedValueOnce({ data: { id: 101, session_id: 1 }, error: null })
        .mockResolvedValueOnce({ data: null, error: null });

      const res = await POST(makeReq("POST", { action: "skip_contact", session_id: 1, contact_id: 101 }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });
  });

  describe("complete_session", () => {
    it("completes session successfully", async () => {
      mockSingle
        .mockResolvedValueOnce({ data: { id: 1, owner: "user-123", status: "active" }, error: null })
        .mockResolvedValueOnce({ data: null, error: null });

      const res = await POST(makeReq("POST", { action: "complete_session", session_id: 1 }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });
  });
});
