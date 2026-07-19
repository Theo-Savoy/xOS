// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { appendNoteChip, NOTE_TEMPLATE_CHIPS, NoteTemplateChips } from "./formControls";

afterEach(cleanup);

describe("NoteTemplateChips", () => {
  it("shows the 2 chips mapped to 'Appel non décroché'", () => {
    render(<NoteTemplateChips value="" onChange={vi.fn()} resultat="Appel non décroché" />);
    expect(screen.getByRole("group", { name: "Modèles de note" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Rappel +1j" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Rappel +3j" })).toBeTruthy();
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("shows the chips mapped to 'Message répondeur'", () => {
    render(<NoteTemplateChips value="" onChange={vi.fn()} resultat="Message répondeur" />);
    expect(screen.getByRole("button", { name: "Rappel +3j" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Rappel +7j" })).toBeTruthy();
  });

  it("shows the chips mapped to 'Appel décroché'", () => {
    render(<NoteTemplateChips value="" onChange={vi.fn()} resultat="Appel décroché" />);
    expect(screen.getByRole("button", { name: "Décision ce trimestre" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pas de projet" })).toBeTruthy();
  });

  it("shows the chips mapped to 'Appel argumenté'", () => {
    render(<NoteTemplateChips value="" onChange={vi.fn()} resultat="Appel argumenté" />);
    expect(screen.getByRole("button", { name: "Métrique identifiée" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Champion identifié" })).toBeTruthy();
  });

  it("shows the chips mapped to 'RDV planifié'", () => {
    render(<NoteTemplateChips value="" onChange={vi.fn()} resultat="RDV planifié" />);
    expect(screen.getByRole("button", { name: "Décideur connu" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Décision ce trimestre" })).toBeTruthy();
  });

  it("never exceeds 5 chips for any outcome", () => {
    for (const chips of Object.values(NOTE_TEMPLATE_CHIPS)) {
      expect(chips.length).toBeLessThanOrEqual(5);
    }
  });

  it("stays hidden once the comment already has content", () => {
    render(<NoteTemplateChips value="déjà écrit" onChange={vi.fn()} resultat="Appel décroché" />);
    expect(screen.queryByRole("group", { name: "Modèles de note" })).toBeNull();
  });

  it("adds the chip text directly when the comment is empty", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<NoteTemplateChips value="" onChange={onChange} resultat="Appel argumenté" />);
    await user.click(screen.getByRole("button", { name: "Métrique identifiée" }));
    expect(onChange).toHaveBeenCalledWith("Métrique identifiée");
  });

  it("joins an existing comment and the chip with a comma separator", () => {
    expect(appendNoteChip("Champion identifié", "Curieux")).toBe("Champion identifié, Curieux");
    expect(appendNoteChip("", "Curieux")).toBe("Curieux");
  });
});
