import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, POST, DELETE, parsePresetId, validatePresetInput } from "./presets.js";

const { mockVerifyJWT } = vi.hoisted(() => ({
  mockVerifyJWT: vi.fn(),
}));

vi.mock("./_auth.js", () => ({
  verifyJWT: mockVerifyJWT,
}));

const mockSingle = vi.fn();
const mockMaybeSingle = vi.fn();
const mockChain = {
  then(onFulfilled, onRejected) {
    return Promise.resolve(mockSingle()).then(onFulfilled, onRejected);
  },
  select() { return this; },
  insert() { return this; },
  delete() { return this; },
  eq() { return this; },
  or() { return this; },
  order() { return this; },
  single() { return mockSingle(); },
  maybeSingle() { return mockMaybeSingle(); },
};
const mockFrom = vi.fn(() => mockChain);

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: mockFrom }),
}));

function makeReq(method, body, url = "http://localhost/api/presets") {
  const headers = new Headers({
    Authorization: "Bearer token",
    "Content-Type": "application/json",
  });
  return new Request(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

beforeEach(() => {
  vi.restoreAllMocks();
  mockSingle.mockReset();
  mockMaybeSingle.mockReset();
  mockFrom.mockClear();
  vi.stubEnv("SUPABASE_URL", "https://test.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
  mockVerifyJWT.mockResolvedValue({ id: "user-123" });
  mockSingle.mockResolvedValue({ data: null, error: null });
});

describe("parsePresetId", () => {
  it("accepts positive integers only", () => {
    expect(parsePresetId(5)).toBe(5);
    expect(parsePresetId("42")).toBe(42);
  });

  it("rejects partial or non-integer strings", () => {
    expect(parsePresetId("1abc")).toBeNull();
    expect(parsePresetId("1.5")).toBeNull();
    expect(parsePresetId("1e3")).toBeNull();
    expect(parsePresetId("0")).toBeNull();
    expect(parsePresetId("-3")).toBeNull();
  });
});

describe("validatePresetInput", () => {
  it("rejects invalid filters families", () => {
    expect(validatePresetInput({ name: "X", filters: { relance: [] } }).error).toBe("invalid_filters");
  });
});

describe("GET /api/presets", () => {
  it("returns 500 on DB lookup error", async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: { message: "db" } });
    const res = await GET(makeReq("GET"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("preset_lookup_failed");
  });

  it("returns presets list", async () => {
    mockSingle.mockResolvedValueOnce({
      data: [{ id: 1, owner: "user-123", name: "Prospects", filters: {}, shared: false, created_at: "2026-01-01" }],
      error: null,
    });
    const res = await GET(makeReq("GET"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.presets).toHaveLength(1);
  });
});

describe("DELETE /api/presets", () => {
  it("returns 400 for invalid id strings", async () => {
    const res = await DELETE(makeReq("DELETE", undefined, "http://localhost/api/presets?id=1abc"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_id");
  });

  it("returns 500 when preset lookup fails", async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: { message: "db" } });
    const res = await DELETE(makeReq("DELETE", undefined, "http://localhost/api/presets?id=3"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("preset_lookup_failed");
  });

  it("returns 404 when preset not owned by user", async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: { id: 3, owner: "other-user" }, error: null });
    const res = await DELETE(makeReq("DELETE", undefined, "http://localhost/api/presets?id=3"));
    expect(res.status).toBe(404);
  });

  it("deletes owned preset", async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: { id: 3, owner: "user-123" }, error: null });
    mockSingle.mockResolvedValueOnce({ data: null, error: null });
    const res = await DELETE(makeReq("DELETE", undefined, "http://localhost/api/presets?id=3"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});

describe("POST /api/presets", () => {
  it("creates preset", async () => {
    mockSingle.mockResolvedValueOnce({
      data: { id: 2, owner: "user-123", name: "Relance", filters: { relance: {} }, shared: false, created_at: "2026-01-01" },
      error: null,
    });
    const res = await POST(makeReq("POST", { name: "Relance", filters: { relance: {} } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.preset.name).toBe("Relance");
  });
});
