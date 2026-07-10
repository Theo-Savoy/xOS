/**
 * api/calls-list.test.js — Tests for api/calls-list.js.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  escapeSOQL,
  buildSoqlQuery,
  normalizeContacts,
  parseFilters,
  POST,
} from "./calls-list.js";

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
const mockEq = vi.fn(() => ({ maybeSingle: mockMaybeSingle }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));
const mockSupabase = { from: mockFrom };

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => mockSupabase,
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

function makeRawReq(rawBody) {
  const headers = new Headers({
    Authorization: "Bearer supabase-jwt-token",
    "Content-Type": "application/json",
  });
  return new Request("http://localhost/api/calls-list", {
    method: "POST",
    headers,
    body: rawBody,
  });
}

const SF_CONTACT_RECORDS = {
  records: [
    {
      Id: "003000000000001AAA",
      Name: "Marie Dupont",
      Phone: "+33123456789",
      Account: { Id: "001000000000001AAA", Name: "ACME" },
    },
    {
      Id: "003000000000002AAA",
      Name: "Jean Martin",
      Phone: "+33987654321",
      Account: null,
    },
  ],
};

describe("escapeSOQL", () => {
  it("escapes single quotes", () => {
    expect(escapeSOQL("O'Brien")).toBe("O\\'Brien");
  });

  it("escapes backslashes", () => {
    expect(escapeSOQL("path\\to")).toBe("path\\\\to");
  });
});

describe("buildSoqlQuery", () => {
  it("builds query with default filters and owner", () => {
    const soql = buildSoqlQuery(
      { ownerOnly: true, hasPhone: true, limit: 50 },
      "005000000000001AAA",
    );
    expect(soql).toBe(
      "SELECT Id, Name, Phone, Account.Id, Account.Name FROM Contact WHERE Phone != null AND OwnerId = '005000000000001AAA' LIMIT 50",
    );
  });

  it("omits owner filter when ownerOnly is false", () => {
    const soql = buildSoqlQuery(
      { ownerOnly: false, hasPhone: true, limit: 25 },
      "005000000000001AAA",
    );
    expect(soql).toBe(
      "SELECT Id, Name, Phone, Account.Id, Account.Name FROM Contact WHERE Phone != null LIMIT 25",
    );
  });

  it("omits phone filter when hasPhone is false", () => {
    const soql = buildSoqlQuery(
      { ownerOnly: true, hasPhone: false, limit: 10 },
      "005000000000001AAA",
    );
    expect(soql).toBe(
      "SELECT Id, Name, Phone, Account.Id, Account.Name FROM Contact WHERE OwnerId = '005000000000001AAA' LIMIT 10",
    );
  });

  it("adds accountId filter when provided", () => {
    const soql = buildSoqlQuery(
      {
        ownerOnly: true,
        hasPhone: true,
        accountId: "001000000000001AAA",
        limit: 50,
      },
      "005000000000001AAA",
    );
    expect(soql).toContain("AccountId = '001000000000001AAA'");
  });

  it("escapes single quotes in sf user id", () => {
    const soql = buildSoqlQuery(
      { ownerOnly: true, hasPhone: true, limit: 50 },
      "005O'Brien00001AAA",
    );
    expect(soql).toContain("OwnerId = '005O\\'Brien00001AAA'");
  });
});

describe("normalizeContacts", () => {
  it("maps Salesforce records to create_session contact shape", () => {
    const result = normalizeContacts(SF_CONTACT_RECORDS.records);
    expect(result).toEqual([
      {
        sf_contact_id: "003000000000001AAA",
        sf_account_id: "001000000000001AAA",
        contact_name: "Marie Dupont",
        account_name: "ACME",
        phone: "+33123456789",
      },
      {
        sf_contact_id: "003000000000002AAA",
        sf_account_id: null,
        contact_name: "Jean Martin",
        account_name: null,
        phone: "+33987654321",
      },
    ]);
  });

  it("returns empty array for null input", () => {
    expect(normalizeContacts(null)).toEqual([]);
  });

  it("ignores records without Id", () => {
    expect(normalizeContacts([{ Name: "No Id" }])).toEqual([]);
  });
});

describe("parseFilters", () => {
  it("applies defaults when filters object is empty", () => {
    const result = parseFilters({ filters: {} });
    expect(result).toEqual({
      ok: true,
      filters: { ownerOnly: true, hasPhone: true, accountId: undefined, limit: 50 },
    });
  });

  it("rejects missing filters", () => {
    expect(parseFilters({})).toEqual({ ok: false, error: "invalid_body" });
  });

  it("rejects non-object filters", () => {
    expect(parseFilters({ filters: [] })).toEqual({ ok: false, error: "invalid_filters" });
  });

  it("rejects invalid accountId", () => {
    expect(parseFilters({ filters: { accountId: "bad" } })).toEqual({
      ok: false,
      error: "invalid_filters",
    });
  });

  it("treats empty/whitespace accountId as absent (UI sends '')", () => {
    const result = parseFilters({ filters: { accountId: "  " } });
    expect(result.ok).toBe(true);
    expect(result.filters.accountId).toBeUndefined();
  });

  it("rejects limit above max", () => {
    expect(parseFilters({ filters: { limit: 201 } })).toEqual({
      ok: false,
      error: "invalid_filters",
    });
  });

  it("rejects non-integer limit", () => {
    expect(parseFilters({ filters: { limit: 10.5 } })).toEqual({
      ok: false,
      error: "invalid_filters",
    });
  });
});

describe("POST /api/calls-list", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockMaybeSingle.mockClear();
    mockEq.mockClear();
    mockSelect.mockClear();
    mockFrom.mockClear();

    vi.stubEnv("SF_CLIENT_ID", "test-client-id");
    vi.stubEnv("SF_CLIENT_SECRET", "test-client-secret");
    vi.stubEnv("SF_REFRESH_TOKEN", "test-refresh-token");
    vi.stubEnv("SF_LOGIN_URL", "https://login.test.salesforce.com");
    vi.stubEnv("SF_INSTANCE_URL", "https://test.my.salesforce.com");
    vi.stubEnv("SUPABASE_URL", "https://test-supabase-url.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");

    mockVerifyJWT.mockResolvedValue({
      id: "user-123",
      email: "test@xos-learning.fr",
    });

    mockMaybeSingle.mockResolvedValue({
      data: { sf_user_id: "005000000000001AAA" },
      error: null,
    });
  });

  it("returns 401 when user is unauthorized", async () => {
    mockVerifyJWT.mockResolvedValue(null);
    const res = await POST(makeReq({ filters: {} }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("unauthorized");
  });

  it("returns 400 when body is invalid JSON", async () => {
    const res = await POST(makeRawReq("{invalid"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_json");
  });

  it("returns 400 invalid_body when body is null", async () => {
    const res = await POST(makeRawReq("null"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_body");
  });

  it("returns 400 invalid_body when filters is missing", async () => {
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_body");
  });

  it("returns 400 no_sf_user_mapping when ownerOnly is true but profile has no sf_user_id", async () => {
    mockMaybeSingle.mockResolvedValue({ data: { sf_user_id: null }, error: null });
    const res = await POST(makeReq({ filters: {} }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("no_sf_user_mapping");
  });

  it("skips profile lookup when ownerOnly is false", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: "sf-token" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ records: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const res = await POST(makeReq({ filters: { ownerOnly: false } }));
    expect(res.status).toBe(200);
    expect(mockFrom).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("calls SF query endpoint with SOQL and returns normalized contacts", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: "sf-token" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    fetchSpy.mockImplementationOnce((url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      expect(urlStr).toContain("/services/data/v67.0/query?");
      expect(urlStr).toContain("SELECT+Id%2C+Name%2C+Phone%2C+Account.Id%2C+Account.Name+FROM+Contact");
      expect(urlStr).toContain("OwnerId+%3D+%27005000000000001AAA%27");
      expect(urlStr).toContain("LIMIT+50");
      return Promise.resolve(
        new Response(JSON.stringify(SF_CONTACT_RECORDS), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });

    const res = await POST(makeReq({ filters: { accountId: "001000000000001AAA" } }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.contacts).toHaveLength(2);
    expect(body.contacts[0]).toEqual({
      sf_contact_id: "003000000000001AAA",
      sf_account_id: "001000000000001AAA",
      contact_name: "Marie Dupont",
      account_name: "ACME",
      phone: "+33123456789",
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(mockFrom).toHaveBeenCalledWith("profiles");
  });

  it("sets Cache-Control: no-store on success", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: "sf-token" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ records: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const res = await POST(makeReq({ filters: {} }));
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns 502 when SF OAuth fails", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockResolvedValueOnce(new Response("invalid_grant", { status: 400 }));

    const res = await POST(makeReq({ filters: {} }));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("sf_auth_error");
  });

  it("returns 502 when SOQL query fails", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: "sf-token" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    fetchSpy.mockResolvedValueOnce(new Response("MALFORMED_QUERY", { status: 400 }));

    const res = await POST(makeReq({ filters: {} }));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("sf_query_error");
  });
});
