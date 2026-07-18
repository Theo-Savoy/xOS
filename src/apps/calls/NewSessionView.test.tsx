// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NewSessionView } from "./NewSessionView";
import { emptyFilterTree } from "../../crm";

afterEach(cleanup);

const noop = vi.fn();

describe("NewSessionView — UX writing (spec §4.3)", () => {
  it("labels account-precise targeting as 'Comptes précis (ABM)' rather than jargon", () => {
    render(
      <NewSessionView
        filters={emptyFilterTree()}
        onFiltersChange={noop}
        contactLimit={100}
        onContactLimitChange={noop}
        maxPerCompany={null}
        onMaxPerCompanyChange={noop}
        loading={false}
        previewLoading={false}
        matchCount={null}
        matchCountCapped={false}
        matchCountLoading={false}
        matchCountError={null}
        error={null}
        preview={[]}
        dedup={[]}
        previewTruncated={false}
        presets={[]}
        presetsLoading={false}
        savingPreset={false}
        currentUserId="user-1"
        onBack={noop}
        onOpenAccountSearch={noop}
        onPreview={noop}
        onLoadPreset={noop}
        onSavePreset={noop}
        onDeletePreset={noop}
        onCreate={noop}
      />,
    );
    expect(screen.getByRole("button", { name: "Comptes précis (ABM)" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Mode ABM" })).toBeNull();
  });

  it("shows the live preview count in plain terrain language", () => {
    const preview = [
      {
        sf_contact_id: "003a",
        sf_account_id: "001a",
        contact_name: "Alice Martin",
        account_name: "Acme",
        phone: "0102030405",
      },
    ];
    render(
      <NewSessionView
        filters={emptyFilterTree()}
        onFiltersChange={noop}
        contactLimit={100}
        onContactLimitChange={noop}
        maxPerCompany={null}
        onMaxPerCompanyChange={noop}
        loading={false}
        previewLoading={false}
        matchCount={null}
        matchCountCapped={false}
        matchCountLoading={false}
        matchCountError={null}
        error={null}
        preview={preview}
        dedup={[]}
        previewTruncated={false}
        presets={[]}
        presetsLoading={false}
        savingPreset={false}
        currentUserId="user-1"
        onBack={noop}
        onPreview={noop}
        onLoadPreset={noop}
        onSavePreset={noop}
        onDeletePreset={noop}
        onCreate={noop}
      />,
    );
    expect(screen.getByRole("heading", { name: "Aperçu — 1 contact trouvé" })).toBeTruthy();
  });
});
