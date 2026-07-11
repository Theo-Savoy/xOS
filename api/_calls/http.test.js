import { afterEach, describe, expect, it, vi } from "vitest";

const { mockCreateClient } = vi.hoisted(() => ({ mockCreateClient: vi.fn() }));

vi.mock("@supabase/supabase-js", () => ({ createClient: mockCreateClient }));
vi.mock("../_crm/salesforce.js", () => ({ buildLightningUrl: vi.fn() }));

import { __resetServiceClient, getServiceClient } from "./http.js";

afterEach(() => {
  __resetServiceClient();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("getServiceClient", () => {
  it("memoizes the service client after its first successful creation", () => {
    const client = { from: vi.fn() };
    vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    mockCreateClient.mockReturnValue(client);

    expect(getServiceClient()).toBe(client);
    expect(getServiceClient()).toBe(client);
    expect(mockCreateClient).toHaveBeenCalledTimes(1);
  });

  it("does not cache a missing configuration and retries later", () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(getServiceClient()).toBeNull();

    const client = { from: vi.fn() };
    vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    mockCreateClient.mockReturnValue(client);

    expect(getServiceClient()).toBe(client);
    expect(mockCreateClient).toHaveBeenCalledOnce();
  });
});
