import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockVerifyJWT, mockGetProfile, mockFetchSFToken, mockSearchContacts } = vi.hoisted(() => ({
  mockVerifyJWT: vi.fn(),
  mockGetProfile: vi.fn(),
  mockFetchSFToken: vi.fn(),
  mockSearchContacts: vi.fn(),
}));

vi.mock("./_auth.js", () => ({
  respond: (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  verifyJWT: mockVerifyJWT,
}));
vi.mock("./_calls/profileCache.js", () => ({ getProfile: mockGetProfile }));
vi.mock("./_crm/salesforce.js", () => ({
  fetchSFToken: mockFetchSFToken,
  searchContacts: mockSearchContacts,
}));

const mockFrom = vi.fn();
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ from: mockFrom }) }));

import { GET } from "./weekly-targets.js";

const teamProfiles = [
  { id: "user-a", email: "ada@xos-learning.fr", full_name: "Ada", sf_user_id: "005A", role: "commercial" },
  { id: "user-b", email: "bea@xos-learning.fr", full_name: "Béa", sf_user_id: "005B", role: "manager" },
];

function request() {
  return new Request("https://xos.test/api/weekly-targets", { headers: { Authorization: "Bearer token" } });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-11T12:00:00.000Z"));
  vi.clearAllMocks();
  vi.stubEnv("SUPABASE_URL", "https://test.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
  mockVerifyJWT.mockResolvedValue({ id: "user-b", email: "bea@xos-learning.fr" });
  mockGetProfile.mockResolvedValue({ sfUserId: "005B", fullName: "Béa", role: "manager" });
  mockFetchSFToken.mockResolvedValue({ accessToken: "sf-token" });
  mockSearchContacts.mockResolvedValue({ records: [] });
  mockFrom.mockImplementation((table) => {
    if (table === "settings") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({
              data: { value: { "005A": { "FY27-Q1": 60000 } } },
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === "profiles") {
      return {
        select: () => ({
          order: () => Promise.resolve({ data: teamProfiles, error: null }),
        }),
      };
    }
    throw new Error(`Unexpected table ${table}`);
  });
});

describe("GET /api/weekly-targets", () => {
  it("loads the module and returns quarter targets for sellers", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.quarter).toMatchObject({ label: "FY27-Q1", from: "2026-07-01" });
    expect(body.rows.map((row) => row.sf_user_id)).toEqual(["005A", "005B"]);
    expect(body.rows.find((row) => row.sf_user_id === "005A")).toMatchObject({ name: "Ada", quarterly_target: 60000 });
  });
});
