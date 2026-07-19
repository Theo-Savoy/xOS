// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  appendNoteChip,
  MEDDIC_CHIPS,
  NoteTemplateChips,
  RESULTAT_TO_MEDDIC_CATEGORIES,
} from "./noteTemplates";

afterEach(cleanup);

describe("RESULTAT_TO_MEDDIC_CATEGORIES", () => {
  it("exposes only 'timing' for the two unreached outcomes", () => {
    expect(RESULTAT_TO_MEDDIC_CATEGORIES["Appel non décroché"]).toEqual(["timing"]);
    expect(RESULTAT_TO_MEDDIC_CATEGORIES["Message répondeur"]).toEqual(["timing"]);
  });

  it("exposes 3 categories for 'Appel décroché'", () => {
    expect(RESULTAT_TO_MEDDIC_CATEGORIES["Appel décroché"]).toEqual(["douleur", "maturite", "concurrence"]);
  });

  it("exposes 5 categories for 'Appel argumenté'", () => {
    expect(RESULTAT_TO_MEDDIC_CATEGORIES["Appel argumenté"]).toHaveLength(5);
  });

  it("exposes the richest set (7 categories) for 'RDV planifié'", () => {
    expect(RESULTAT_TO_MEDDIC_CATEGORIES["RDV planifié"]).toHaveLength(7);
  });

  it("every category referenced has between 3 and 7 chip options", () => {
    for (const categories of Object.values(RESULTAT_TO_MEDDIC_CATEGORIES)) {
      for (const category of categories) {
        const options = MEDDIC_CHIPS[category];
        expect(options.length).toBeGreaterThanOrEqual(3);
        expect(options.length).toBeLessThanOrEqual(7);
      }
    }
  });
});

describe("appendNoteChip", () => {
  it("joins an existing comment and the chip with a comma separator", () => {
    expect(appendNoteChip("Champion identifié", "Curieux")).toBe("Champion identifié, Curieux");
    expect(appendNoteChip("", "Curieux")).toBe("Curieux");
  });
});

describe("NoteTemplateChips", () => {
  it("renders one group per applicable category for the outcome", () => {
    render(<NoteTemplateChips value="" onChange={vi.fn()} resultat="RDV planifié" />);
    expect(screen.getByRole("group", { name: "Modèles de note MEDDIC" })).toBeTruthy();
    for (const category of RESULTAT_TO_MEDDIC_CATEGORIES["RDV planifié"]) {
      for (const opt of MEDDIC_CHIPS[category]) {
        expect(screen.getByRole("button", { name: opt.label })).toBeTruthy();
      }
    }
  });

  it("shows only the 'timing' options for 'Appel non décroché'", () => {
    render(<NoteTemplateChips value="" onChange={vi.fn()} resultat="Appel non décroché" />);
    for (const opt of MEDDIC_CHIPS.timing) {
      expect(screen.getByRole("button", { name: opt.label })).toBeTruthy();
    }
    for (const opt of MEDDIC_CHIPS.budget) {
      expect(screen.queryByRole("button", { name: opt.label })).toBeNull();
    }
  });

  it("stays hidden once the comment already has content", () => {
    render(<NoteTemplateChips value="déjà écrit" onChange={vi.fn()} resultat="Appel décroché" />);
    expect(screen.queryByRole("group", { name: "Modèles de note MEDDIC" })).toBeNull();
  });

  it("adds the chip value directly when the comment is empty", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<NoteTemplateChips value="" onChange={onChange} resultat="Appel argumenté" />);
    await user.click(screen.getByRole("button", { name: "Métrique identifiée" }));
    expect(onChange).toHaveBeenCalledWith("Métrique identifiée");
  });
});
