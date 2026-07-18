import { describe, expect, it } from "vitest";
import { checkBadges } from "./comboBadges";
import type { BadgeCheckInput } from "./comboBadges";

const BASE_STATE: BadgeCheckInput = {
  sessionsCompletedCount: 0,
  shortcutsUsedToday: 0,
  rdvInCurrentSession: 0,
  sessionStartedBeforeNineAm: false,
  contactsCompletedInSession: 0,
  npaTotal: 0,
  muraReussiteSigned: false,
};

describe("comboBadges", () => {
  it("unlocks premier_pas on the first completed session", () => {
    expect(checkBadges({ ...BASE_STATE, sessionsCompletedCount: 1 }, [])).toContain("premier_pas");
  });

  it("does not unlock premier_pas twice", () => {
    expect(checkBadges({ ...BASE_STATE, sessionsCompletedCount: 1 }, ["premier_pas"])).not.toContain("premier_pas");
  });

  it("unlocks eclair at 50 shortcuts in a day", () => {
    expect(checkBadges({ ...BASE_STATE, shortcutsUsedToday: 49 }, [])).not.toContain("eclair");
    expect(checkBadges({ ...BASE_STATE, shortcutsUsedToday: 50 }, [])).toContain("eclair");
  });

  it("unlocks trois_banderilles at 3 rdv in the same session", () => {
    expect(checkBadges({ ...BASE_STATE, rdvInCurrentSession: 2 }, [])).not.toContain("trois_banderilles");
    expect(checkBadges({ ...BASE_STATE, rdvInCurrentSession: 3 }, [])).toContain("trois_banderilles");
  });

  it("unlocks leve_tot when the session started before 9h", () => {
    expect(checkBadges({ ...BASE_STATE, sessionStartedBeforeNineAm: true }, [])).toContain("leve_tot");
  });

  it("unlocks marathon at 50 contacts completed in the session", () => {
    expect(checkBadges({ ...BASE_STATE, contactsCompletedInSession: 49 }, [])).not.toContain("marathon");
    expect(checkBadges({ ...BASE_STATE, contactsCompletedInSession: 50 }, [])).toContain("marathon");
  });

  it("unlocks sang_froid at 10 npa total", () => {
    expect(checkBadges({ ...BASE_STATE, npaTotal: 9 }, [])).not.toContain("sang_froid");
    expect(checkBadges({ ...BASE_STATE, npaTotal: 10 }, [])).toContain("sang_froid");
  });

  it("unlocks mur_reussites when the user signed a pinned achievement", () => {
    expect(checkBadges({ ...BASE_STATE, muraReussiteSigned: true }, [])).toContain("mur_reussites");
  });

  it("never unlocks relais — Arena does not exist yet", () => {
    const everything: BadgeCheckInput = {
      sessionsCompletedCount: 1,
      shortcutsUsedToday: 50,
      rdvInCurrentSession: 3,
      sessionStartedBeforeNineAm: true,
      contactsCompletedInSession: 50,
      npaTotal: 10,
      muraReussiteSigned: true,
    };
    expect(checkBadges(everything, [])).not.toContain("relais");
  });

  it("can unlock multiple badges in a single check", () => {
    const state: BadgeCheckInput = { ...BASE_STATE, sessionsCompletedCount: 1, shortcutsUsedToday: 50 };
    const unlocked = checkBadges(state, []);
    expect(unlocked).toContain("premier_pas");
    expect(unlocked).toContain("eclair");
    expect(unlocked).toHaveLength(2);
  });

  it("returns nothing already-held badges even if criteria still hold", () => {
    const state: BadgeCheckInput = { ...BASE_STATE, sessionsCompletedCount: 1 };
    expect(checkBadges(state, ["premier_pas"])).toEqual([]);
  });
});
