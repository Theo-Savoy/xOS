import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockVerifyJWT, mockFrom, mockRpc, mockDb, mockGt, mockUpsert } = vi.hoisted(() => {
  const mockDb = vi.fn();
  const mockGt = vi.fn();
  const mockUpsert = vi.fn();
  const chain = {
    then(onFulfilled, onRejected) {
      return Promise.resolve(mockDb()).then(onFulfilled, onRejected);
    },
    select() {
      return this;
    },
    eq() {
      return this;
    },
    gt(...args) {
      mockGt(...args);
      return this;
    },
    is() {
      return this;
    },
    order() {
      return this;
    },
    limit() {
      return this;
    },
    update() {
      return this;
    },
    upsert() {
      mockUpsert(...arguments);
      return this;
    },
    in() {
      return this;
    },
  };
  return {
    mockVerifyJWT: vi.fn(),
    mockFrom: vi.fn(() => chain),
    mockRpc: vi.fn(),
    mockDb,
    mockGt,
    mockUpsert,
  };
});

vi.mock("./_auth.js", () => ({
  respond: (status, body) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  verifyJWT: mockVerifyJWT,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: mockFrom, rpc: mockRpc }),
}));

import { GET, insertUserNotification } from "./notifications.js";

function request(url = "https://xos.test/api/notifications") {
  return new Request(url, {
    headers: { Authorization: "Bearer token" },
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  mockVerifyJWT.mockResolvedValue({ id: "user-1" });
  mockRpc.mockResolvedValue({ data: 0, error: null });
  mockGt.mockClear();
  mockUpsert.mockClear();
  mockFrom.mockClear();
  mockDb.mockReset();
  vi.stubEnv("SUPABASE_URL", "https://test.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
});

describe("GET /api/notifications", () => {
  it("passes an explicit since filter and returns only newer rows", async () => {
    const since = "2026-07-13T18:00:00.000Z";
    const newer = {
      id: 2,
      kind: "session_goal_hit",
      title: "Objectif atteint !",
      body: "Bravo",
      payload: {},
      created_at: "2026-07-13T18:01:00.000Z",
      read_at: null,
    };
    mockDb
      .mockResolvedValueOnce({ data: [newer], error: null })
      .mockResolvedValueOnce({ count: 1, error: null });

    const response = await GET(
      request(`https://xos.test/api/notifications?since=${encodeURIComponent(since)}`),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      notifications: [newer],
      unread_count: 1,
    });
    expect(mockGt).toHaveBeenCalledWith("created_at", since);
    expect(mockGt).toHaveBeenCalledTimes(2);
    expect(mockRpc).toHaveBeenCalledWith("purge_user_notifications", {
      max_age_hours: 1,
    });
  });
});

describe("insertUserNotification", () => {
  it("uses an idempotent recipient/key upsert for deduplicated notifications", async () => {
    mockDb.mockResolvedValueOnce({ data: null, error: null });

    await insertUserNotification({ from: mockFrom }, {
      recipientId: "user-1",
      kind: "session_goal_hit",
      title: "Objectif RDV atteint",
      body: "Bravo",
      payload: { session_id: 12 },
      dedupeKey: "goal:12:3:user-1",
    });

    expect(mockFrom).toHaveBeenCalledWith("user_notifications");
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ dedupe_key: "goal:12:3:user-1" }),
      { onConflict: "recipient_id,dedupe_key", ignoreDuplicates: true },
    );
  });
});
