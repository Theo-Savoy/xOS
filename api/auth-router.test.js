import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, OPTIONS, POST } from "./auth.js";

const { mockVerifyJWT } = vi.hoisted(() => ({ mockVerifyJWT: vi.fn() }));

vi.mock("./_auth.js", () => ({
  verifyJWT: mockVerifyJWT,
  respond: (status, body) => new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  }),
}));

describe("GET /api/auth", () => {
  it("redirects Salesforce flow to the login screen with sf_coming_soon until OAuth is wired", async () => {
    const response = await GET(new Request("https://xos.hellotheo.fr/api/auth?flow=salesforce"));
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      "https://xos.hellotheo.fr/?auth_error=sf_coming_soon",
    );
  });

  it("rejects unrecognized flows", async () => {
    const response = await GET(new Request("https://xos.hellotheo.fr/api/auth"));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_flow" });
  });
});

describe("POST /api/auth", () => {
  beforeEach(() => {
    vi.stubEnv("DASHBOARD_PASSWORD", "legacy-password");
    mockVerifyJWT.mockResolvedValue({ id: "user-1" });
  });

  it("sets the legacy cookie after JWT verification", async () => {
    const response = await POST(new Request("https://xos.hellotheo.fr/api/auth", { method: "POST" }));
    expect(response.status).toBe(204);
    expect(response.headers.get("Set-Cookie")).toBe(
      "xos_auth=legacy-password; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000",
    );
  });

  it("preserves the unauthorized response", async () => {
    mockVerifyJWT.mockResolvedValue(null);
    const response = await POST(new Request("https://xos.hellotheo.fr/api/auth", { method: "POST" }));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });
});

describe("OPTIONS /api/auth", () => {
  it("advertises GET and POST", async () => {
    const response = await OPTIONS();
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET, POST, OPTIONS");
  });
});
