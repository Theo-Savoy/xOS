// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

describe("sleekplan", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    document.head
      .querySelectorAll('script[src*="sleekplan"]')
      .forEach((script) => script.remove());
    delete window.SLEEK_PRODUCT_ID;
    delete window.$sleek;
  });

  it("injects the SDK once when a product id is configured", async () => {
    vi.stubEnv("VITE_SLEEK_PRODUCT_ID", "12345");
    vi.resetModules();
    const { initSleekplan, sleekplanEnabled } = await import("./sleekplan");

    expect(sleekplanEnabled).toBe(true);
    initSleekplan();
    initSleekplan();

    const scripts = document.head.querySelectorAll(
      'script[src="https://client.sleekplan.com/sdk/e.js"]',
    );
    expect(scripts.length).toBe(1);
    expect(window.SLEEK_PRODUCT_ID).toBe(12345);
  });

  it("does nothing without a product id", async () => {
    const { initSleekplan, sleekplanEnabled } = await import("./sleekplan");

    expect(sleekplanEnabled).toBe(false);
    initSleekplan();

    expect(document.head.querySelector('script[src*="sleekplan"]')).toBeNull();
  });
});
