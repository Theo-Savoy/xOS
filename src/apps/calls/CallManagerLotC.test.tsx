// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  completeSession: vi.fn(),
  createFollowUpSession: vi.fn(),
  createPreset: vi.fn(),
  createSession: vi.fn(),
  deletePreset: vi.fn(),
  fetchContactContext: vi.fn(),
  fetchContactList: vi.fn(),
  fetchPresets: vi.fn(),
  fetchSession: vi.fn(),
  fetchSessions: vi.fn(),
  fetchStats: vi.fn(),
  logCall: vi.fn(),
  logEvent: vi.fn(),
  skipContact: vi.fn(),
}));

vi.mock("../../auth/useSession", () => ({
  useSession: () => ({
    session: { user: { id: "user-1", email: "test@example.com" }, access_token: "test-token" },
  }),
}));

vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  ...api,
}));

import CallManagerApp from "./CallManagerApp";

const activeSession = {
  id: 1,
  name: "Séance Lot C",
  status: "active" as const,
  created_at: "2026-07-10T10:00:00Z",
};

function contact(id: number, status: "pending" | "called" = "pending") {
  return {
    id,
    position: id,
    sf_contact_id: `003${String(id).padStart(12, "0")}`,
    sf_account_id: null,
    contact_name: `Contact ${id}`,
    account_name: "Acme",
    phone: "0102030405",
    title: null,
    linkedin_url: null,
    status,
    outcome: status === "called" ? "Appel non décroché" : null,
    comments: null,
    sf_task_id: null,
    sf_event_id: null,
    called_at: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.fetchSessions.mockResolvedValue([]);
  api.fetchStats.mockResolvedValue({ calls_today: 0, calls_week: 0, sessions_active: 1, sessions_completed: 0 });
  api.fetchContactContext.mockResolvedValue({ contact_record_url: null, account_record_url: null, tasks: [], opportunities: [] });
  api.completeSession.mockResolvedValue(undefined);
});

afterEach(() => cleanup());

describe("CallManagerApp — Lot C", () => {
  it("reloads context for the next pending contact after logging a focused contact", async () => {
    const first = contact(1);
    const second = contact(2);
    api.fetchSession
      .mockResolvedValueOnce({ session: activeSession, contacts: [first, second] })
      .mockResolvedValueOnce({ session: activeSession, contacts: [{ ...first, status: "called" }, second] });
    api.logCall.mockResolvedValue({});

    const user = userEvent.setup();
    render(<CallManagerApp params={{ session_id: "1" }} />);
    await screen.findByRole("heading", { name: "Séance Lot C" });
    await user.click(screen.getByRole("button", { name: "Fiche" }));
    await user.click(screen.getByRole("button", { name: "Logguer & suivant" }));

    await waitFor(() => {
      expect(api.fetchContactContext).toHaveBeenLastCalledWith("test-token", 1, 2);
    });
  });

  it("logs selected contacts in waves and reports aggregate failures", async () => {
    const contacts = Array.from({ length: 6 }, (_, index) => contact(index + 1));
    const completedContacts = contacts.map((item) => ({ ...item, status: "called" as const }));
    const resolvers: Array<(value?: unknown) => void> = [];
    const rejecters: Array<(reason?: unknown) => void> = [];
    api.fetchSession
      .mockResolvedValueOnce({ session: activeSession, contacts })
      .mockResolvedValueOnce({ session: activeSession, contacts: completedContacts })
      .mockResolvedValueOnce({ session: { ...activeSession, status: "completed" }, contacts: completedContacts });
    api.logCall.mockImplementation(
      () => new Promise((resolve, reject) => {
        resolvers.push(resolve);
        rejecters.push(reject);
      }),
    );

    const user = userEvent.setup();
    render(<CallManagerApp params={{ session_id: "1" }} />);
    await screen.findByRole("heading", { name: "Séance Lot C" });
    await user.click(screen.getByRole("button", { name: "Tout sélectionner" }));
    await user.click(screen.getByRole("button", { name: "Consigner pour 6" }));

    await waitFor(() => expect(api.logCall).toHaveBeenCalledTimes(4));
    resolvers[0]();
    resolvers[1]();
    resolvers[2]();
    rejecters[3](new Error("Salesforce indisponible"));
    await waitFor(() => expect(api.logCall).toHaveBeenCalledTimes(6));
    resolvers[4]();
    resolvers[5]();

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("5 consignés, 1 en échec — liste actualisée");
    });
    expect(api.completeSession).toHaveBeenCalledTimes(1);
  });
});
