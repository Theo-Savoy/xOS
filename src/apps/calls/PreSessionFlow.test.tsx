// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PreSessionFlow } from "./PreSessionFlow";
import type { SessionContact, SessionDetail } from "./types";

const callsCss = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("node:fs") as typeof import("node:fs");
  return fs.readFileSync("src/apps/calls/calls.css", "utf8");
});

afterEach(cleanup);

const session: SessionDetail = {
  id: 1,
  name: "Séance test",
  status: "active",
  created_at: "2026-07-10T10:00:00Z",
};

const contact: SessionContact = {
  id: 1,
  position: 1,
  sf_contact_id: "003000000000001",
  sf_account_id: "001000000000001",
  contact_name: "Alice Martin",
  account_name: "Acme",
  phone: "0102030405",
  title: "Responsable formation",
  linkedin_url: null,
  status: "pending",
  outcome: null,
  comments: null,
  sf_task_id: null,
  sf_event_id: null,
  called_at: null,
};

describe("PreSessionFlow", () => {
  it("closes on Escape and restores focus to the element that opened it", () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const onCancel = vi.fn();

    function Harness() {
      const [open, setOpen] = useState(true);
      return open ? (
        <PreSessionFlow
          session={session}
          contacts={[contact]}
          onLaunch={vi.fn().mockResolvedValue(undefined)}
          onCancel={() => {
            onCancel();
            setOpen(false);
          }}
        />
      ) : null;
    }

    render(<Harness />);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("makes an out-of-range objective visible and keeps the CTA disabled", async () => {
    const user = userEvent.setup();
    render(
      <PreSessionFlow
        session={session}
        contacts={[contact]}
        onLaunch={vi.fn().mockResolvedValue(undefined)}
        onCancel={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Définir mon objectif" }));
    const input = screen.getByRole("spinbutton", { name: "Objectif de RDV" });
    await user.clear(input);
    await user.type(input, "9");

    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("Choisis un nombre entier entre 1 et 8 RDV.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Lancer le warmup" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("lets a valid objective start the accessible warmup countdown", async () => {
    const user = userEvent.setup();
    render(
      <PreSessionFlow
        session={session}
        contacts={[contact]}
        onLaunch={vi.fn().mockResolvedValue(undefined)}
        onCancel={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Définir mon objectif" }));
    const input = screen.getByRole("spinbutton", { name: "Objectif de RDV" });
    await user.clear(input);
    await user.type(input, "6");
    await user.click(screen.getByRole("button", { name: "Lancer le warmup" }));

    expect(screen.getByRole("status").textContent).toContain("3");
    expect(screen.getByText("Respire. Une conversation à la fois.")).toBeTruthy();
  });

  it("exposes the pre-session responsive safeguards in the calls stylesheet", async () => {
    expect(callsCss).toContain(".calls-pre-session");
    expect(callsCss).toContain("max-height: calc(100dvh - 2rem)");
    expect(callsCss).toContain(".calls-pre-session__accounts");
  });
});
