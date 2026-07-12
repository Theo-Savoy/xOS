import { afterEach, describe, expect, it, vi } from "vitest";

describe("sleekplan", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("builds the embed URL from the product id", async () => {
    vi.stubEnv("VITE_SLEEK_PRODUCT_ID", "12345");
    vi.resetModules();
    const { sleekplanEnabled, sleekplanEmbedUrl } = await import("./sleekplan");

    expect(sleekplanEnabled).toBe(true);
    expect(sleekplanEmbedUrl).toBe("https://embed-12345.sleekplan.app/?full=true#/feedback/");
  });

  it("is disabled without a product id", async () => {
    const { sleekplanEnabled } = await import("./sleekplan");

    expect(sleekplanEnabled).toBe(false);
  });
});
