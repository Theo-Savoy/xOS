import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildTargetQuery, escapeSOQL, filterTargetContacts } from "./_crm/salesforce.js";
import mapping from "./_crm/mapping.js";
import { POST } from "./calls-list.js";

const { mockVerifyJWT } = vi.hoisted(() => ({
  mockVerifyJWT: vi.fn(),
}));

vi.mock("./_auth.js", () => ({
  verifyJWT: mockVerifyJWT,
  respond: (status, body) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
}));

const mockMaybeSingle = vi.fn();
const mockEq = vi.fn(() => ({ maybeSingle: mockMaybeSingle, eq: mockEq, in: () => mockChain }));
const mockIn = vi.fn(() => mockChain);
const mockSelect = vi.fn(() => ({ eq: mockEq, in: mockIn, select: mockSelect }));
const mockChain = { eq: mockEq, in: mockIn, select: mockSelect };
const mockFrom = vi.fn(() => ({ select: mockSelect }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: mockFrom }),
}));

function makeReq(body, token = "supabase-jwt-token") {
  const headers = new Headers({
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  });
  return new Request("http://localhost/api/calls-list", {
    method: "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const baseFilters = {
  entreprise: { secteurs: ["Finance"] },
  contact: { a_telephone: true },
  relance: {},
};

const SF_RECORDS = [
  {
    Id: "003000000000001AAA",
    Name: "Marie Dupont",
    Phone: "+33123456789",
    AccountId: "001000000000001AAA",
    Account: { Id: "001000000000001AAA", Name: "ACME" },
    Tasks: { totalSize: 1, records: [{ ActivityDate: "2026-07-01", Resultat_call__c: "Appel décroché", CallDurationInSeconds: 60 }] },
  },
];

describe("adapter exports", () => {
  it("escapeSOQL escapes quotes and backslashes", () => {
    expect(escapeSOQL("O'Brien")).toBe("O\\'Brien");
    expect(escapeSOQL("path\\to")).toBe("path\\\\to");
  });

  it("buildTargetQuery uses mapping field names for v2 filter tree", () => {
    const soql = buildTargetQuery(baseFilters, mapping, "005000000000001AAA");
    expect(soql).toContain(`Account.${mapping.objects.account.fields.industry} IN ('Finance')`);
    expect(soql).toContain(`${mapping.objects.contact.fields.phone} != null`);
    expect(soql).toContain(`${mapping.objects.contact.fields.doNotCall} = false`);
    expect(soql).toContain("LIMIT 200");
  });

  it("filterTargetContacts applies dernier_resultat from relance filters", () => {
    const filtered = filterTargetContacts(
      SF_RECORDS,
      { relance: { dernier_resultat: [mapping.objects.task.resultSemantic.followUpNoAnswer] } },
      mapping,
    );
    expect(filtered).toHaveLength(0);
  });
});

describe("POST /api/calls-list", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockMaybeSingle.mockReset();
    mockFrom.mockClear();

    vi.stubEnv("SF_CLIENT_ID", "test-client-id");
    vi.stubEnv("SF_CLIENT_SECRET", "test-client-secret");
    vi.stubEnv("SF_REFRESH_TOKEN", "test-refresh-token");
    vi.stubEnv("SF_LOGIN_URL", "https://login.test.salesforce.com");
    vi.stubEnv("SF_INSTANCE_URL", "https://test.my.salesforce.com");
    vi.stubEnv("SUPABASE_URL", "https://test-supabase-url.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");

    mockVerifyJWT.mockResolvedValue({ id: "user-123", email: "test@xos-learning.fr" });
    mockMaybeSingle.mockResolvedValue({ data: { sf_user_id: "005000000000001AAA" }, error: null });
  });

  it("returns 401 when unauthorized", async () => {
    mockVerifyJWT.mockResolvedValue(null);
    const res = await POST(makeReq({ filters: {} }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when filters is not an object", async () => {
    const res = await POST(makeReq({ filters: [] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_filters");
  });

  it("returns 400 when relance family is not an object", async () => {
    const res = await POST(makeReq({ filters: { relance: [] } }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_filters");
  });

  it("returns contacts and dedup from adapter-backed query", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "sf-token" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ records: SF_RECORDS }), { status: 200 }));

    mockFrom.mockImplementation((table) => {
      if (table === "call_sessions") {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: [], error: null }),
          }),
        };
      }
      return { select: mockSelect };
    });

    const res = await POST(makeReq({ filters: baseFilters, limit: 50 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.contacts).toHaveLength(1);
    expect(body.contacts[0]).toMatchObject({
      sf_contact_id: "003000000000001AAA",
      contact_name: "Marie Dupont",
      account_name: "ACME",
      phone: "+33123456789",
      call_count: 1,
    });
    expect(body.dedup).toEqual([]);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("returns 502 when SF OAuth fails", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockResolvedValueOnce(new Response("invalid_grant", { status: 400 }));

    const res = await POST(makeReq({ filters: {} }));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("sf_auth_error");
  });

  it("returns 500 when profile lookup fails", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: { message: "db error" } });
    const res = await POST(makeReq({ filters: {} }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("profile_lookup_failed");
  });
});
