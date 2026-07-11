import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetSFTokenCache,
  createEvent,
  fetchSFToken,
  logCall,
  searchContacts,
} from "./salesforce.js";

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

describe("Salesforce token cache and 401 retry", () => {
  beforeEach(() => {
    process.env.SF_CLIENT_ID = "client";
    process.env.SF_CLIENT_SECRET = "secret";
    process.env.SF_REFRESH_TOKEN = "refresh";
    process.env.SF_LOGIN_URL = "https://login.example.test";
    process.env.SF_INSTANCE_URL = "https://instance.example.test";
    __resetSFTokenCache();
  });

  afterEach(() => {
    __resetSFTokenCache();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("returns a cached token on the second successful call", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ access_token: "cached-token" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchSFToken()).resolves.toEqual({ accessToken: "cached-token" });
    await expect(fetchSFToken()).resolves.toEqual({ accessToken: "cached-token" });

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("refreshes the token when forceRefresh is requested", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "first-token" }))
      .mockResolvedValueOnce(jsonResponse({ access_token: "second-token" }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchSFToken();
    await expect(fetchSFToken({ forceRefresh: true })).resolves.toEqual({ accessToken: "second-token" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("refreshes the token after its TTL expires", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "first-token" }))
      .mockResolvedValueOnce(jsonResponse({ access_token: "second-token" }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchSFToken();
    vi.advanceTimersByTime(30 * 60_000 + 1);
    await expect(fetchSFToken()).resolves.toEqual({ accessToken: "second-token" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("refreshes and retries a query after one 401", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ message: "expired" }, 401))
      .mockResolvedValueOnce(jsonResponse({ access_token: "fresh-token" }))
      .mockResolvedValueOnce(jsonResponse({ records: [{ Id: "003" }], done: true }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(searchContacts("stale-token", "SELECT Id FROM Contact")).resolves.toEqual({ records: [{ Id: "003" }] });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe("Bearer fresh-token");
  });

  it("returns the existing query error after two 401 responses", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ message: "expired" }, 401))
      .mockResolvedValueOnce(jsonResponse({ access_token: "fresh-token" }))
      .mockResolvedValueOnce(jsonResponse({ message: "still expired" }, 401));
    vi.stubGlobal("fetch", fetchMock);

    await expect(searchContacts("stale-token", "SELECT Id FROM Contact")).resolves.toEqual({
      error: "sf_query_error",
      message: '{"message":"still expired"}',
    });
  });

  it("returns sf_auth_error when a 401 refresh cannot authenticate", async () => {
    process.env.SF_REFRESH_TOKEN = "";
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: "expired" }, 401));
    vi.stubGlobal("fetch", fetchMock);

    await expect(searchContacts("stale-token", "SELECT Id FROM Contact")).resolves.toEqual({ error: "sf_auth_error" });

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("refreshes and retries SObject creation after one 401", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ message: "expired" }, 401))
      .mockResolvedValueOnce(jsonResponse({ access_token: "fresh-token" }))
      .mockResolvedValueOnce(jsonResponse({ id: "00T" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(logCall("stale-token", { contactId: "003", resultat: "Appel décroché" })).resolves.toEqual({ record: { id: "00T" } });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe("Bearer fresh-token");
  });

  it("retries a paginated query page after one 401", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ records: [{ Id: "003" }], done: false, nextRecordsUrl: "/next" }))
      .mockResolvedValueOnce(jsonResponse({ message: "expired" }, 401))
      .mockResolvedValueOnce(jsonResponse({ access_token: "fresh-token" }))
      .mockResolvedValueOnce(jsonResponse({ records: [{ Id: "004" }], done: true }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(searchContacts("stale-token", "SELECT Id FROM Contact")).resolves.toEqual({ records: [{ Id: "003" }, { Id: "004" }] });

    expect(fetchMock.mock.calls[3][1].headers.Authorization).toBe("Bearer fresh-token");
  });

  it("uses the refreshed token for later query pages", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ records: [{ Id: "003" }], done: false, nextRecordsUrl: "/first-next" }))
      .mockResolvedValueOnce(jsonResponse({ message: "expired" }, 401))
      .mockResolvedValueOnce(jsonResponse({ access_token: "fresh-token" }))
      .mockResolvedValueOnce(jsonResponse({ records: [{ Id: "004" }], done: false, nextRecordsUrl: "/second-next" }))
      .mockResolvedValueOnce(jsonResponse({ records: [{ Id: "005" }], done: true }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(searchContacts("stale-token", "SELECT Id FROM Contact")).resolves.toEqual({
      records: [{ Id: "003" }, { Id: "004" }, { Id: "005" }],
    });

    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(fetchMock.mock.calls[4][1].headers.Authorization).toBe("Bearer fresh-token");
  });

  it("retries all createSObject callers through createEvent", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ message: "expired" }, 401))
      .mockResolvedValueOnce(jsonResponse({ access_token: "fresh-token" }))
      .mockResolvedValueOnce(jsonResponse({ id: "00U" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createEvent("stale-token", {
      subject: "Démo",
      startDateTime: "2026-07-11T08:00:00.000Z",
      durationMin: 30,
    })).resolves.toEqual({ record: { id: "00U" } });

    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe("Bearer fresh-token");
  });
});
