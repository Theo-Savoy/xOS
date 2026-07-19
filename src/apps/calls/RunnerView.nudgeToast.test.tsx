// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetNudgeLearningInternals,
  __setLocalStorage,
  __setSessionStorage,
  type StorageLike,
} from "./nudgeLearning";
import { RunnerView } from "./RunnerView";
import type { SessionContact, SessionDetail } from "./types";

function installMemoryStorage(): void {
  const makeStore = (): StorageLike => {
    const store: Record<string, string> = {};
    return {
      getItem: (key) => store[key] ?? null,
      setItem: (key, value) => {
        store[key] = String(value);
      },
      removeItem: (key) => {
        delete store[key];
      },
    };
  };
  __setLocalStorage(makeStore());
  __setSessionStorage(makeStore());
}

beforeEach(() => {
  installMemoryStorage();
  __resetNudgeLearningInternals();
  window.localStorage?.setItem("xos-combo-demo-seen", "1");
  window.localStorage?.setItem("xos-combo-sounds", "0");
});

afterEach(() => {
  cleanup();
  __setLocalStorage(null);
  __setSessionStorage(null);
  __resetNudgeLearningInternals();
});

const session: SessionDetail = {
  id: 1,
  name: "Séance test",
  status: "active",
  created_at: "2026-07-10T10:00:00Z",
};

const bob = {
  id: 2,
  position: 1,
  sf_contact_id: "003000000000002",
  sf_account_id: null,
  contact_name: "Bob Durand",
  account_name: "Acme",
  phone: "0102030405",
  email: "bob@acme.fr",
  title: "Responsable formation",
  linkedin_url: null,
  status: "pending",
  outcome: null,
  comments: null,
  sf_task_id: null,
  sf_event_id: null,
  called_at: null,
} as SessionContact;

const runnerProps = {
  session,
  hubSessions: [] as [],
  loading: false,
  error: null as string | null,
  contactContext: null,
  contextContactId: null,
  contacts: [bob],
  currentContact: bob,
  awaitingEvent: null,
  onBack: vi.fn(),
  onFocusContact: vi.fn(),
  onLogAndNext: vi.fn(),
  onLogRdvAndNext: vi.fn(),
  onLogEvent: vi.fn(),
  onDeferContacts: vi.fn(),
  onRemoveContacts: vi.fn(),
  onUpdateRecall: vi.fn(),
  onLogMany: vi.fn(),
};

describe("RunnerView nudge toast", () => {
  it("shows the K/L/F nudge toast after enough mouse clicks on the Liste/Fiche buttons (threshold 3)", async () => {
    const user = userEvent.setup();
    render(<RunnerView {...runnerProps} />);

    await user.click(screen.getByRole("button", { name: "Fiche" }));
    await user.click(screen.getByRole("button", { name: "Liste" }));
    await user.click(screen.getByRole("button", { name: "Fiche" }));
    await user.click(screen.getByRole("button", { name: "Liste" }));
    // 3rd click on "Liste" crosses the L intensive threshold.
    await user.click(screen.getByRole("button", { name: "Fiche" }));
    await user.click(screen.getByRole("button", { name: "Liste" }));

    expect(
      screen.getByText("Tu peux switcher en vue liste avec `L`"),
    ).toBeTruthy();
  });

  it("dismisses the toast on click and does not show it again for the same shortcut", async () => {
    const user = userEvent.setup();
    render(<RunnerView {...runnerProps} />);

    for (let i = 0; i < 3; i += 1) {
      await user.click(screen.getByRole("button", { name: "Fiche" }));
      await user.click(screen.getByRole("button", { name: "Liste" }));
    }
    const toast = screen.getByText("Tu peux switcher en vue liste avec `L`");
    await user.click(toast);
    expect(screen.queryByText("Tu peux switcher en vue liste avec `L`")).toBeNull();
  });

  it("auto-dismisses the toast after 4s", async () => {
    vi.useFakeTimers();
    render(<RunnerView {...runnerProps} />);

    for (let i = 0; i < 3; i += 1) {
      fireEvent.click(screen.getByRole("button", { name: "Fiche" }));
      fireEvent.click(screen.getByRole("button", { name: "Liste" }));
    }
    expect(screen.getByText("Tu peux switcher en vue liste avec `L`")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.queryByText("Tu peux switcher en vue liste avec `L`")).toBeNull();
    vi.useRealTimers();
  });
});
