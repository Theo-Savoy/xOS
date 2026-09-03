import { describe, expect, it } from 'vitest';
import fyWindow from './__fixtures__/fy-window.js';
import { isRenew, splitNewRenew } from './classify.js';

function allWon(window) {
  return Object.values(window).flatMap((fy) => fy.won || []);
}

describe('isRenew', () => {
  it("détecte 'renew' dans le nom, sans tenir compte de la casse", () => {
    expect(isRenew('Renouvellement RENEW 2026')).toBe(true);
    expect(isRenew('renew')).toBe(true);
  });

  it("détecte 'tacite' dans le nom", () => {
    expect(isRenew('Tacite reconduction')).toBe(true);
  });

  it('classe NEW tout le reste, y compris null', () => {
    expect(isRenew('Projet catalogue')).toBe(false);
    expect(isRenew(null)).toBe(false);
  });
});

describe('splitNewRenew', () => {
  it('conserve total = NEW + RENEW sur la fixture (§2.1)', () => {
    const split = splitNewRenew(allWon(fyWindow));
    expect(split.total.count).toBe(split.new.count + split.renew.count);
    expect(
      Math.abs(split.total.amount - split.new.amount - split.renew.amount),
    ).toBeLessThanOrEqual(0.01);
    expect(split.conservation.ok).toBe(true);
    expect(split.conservation.delta_count).toBe(0);
    expect(Math.abs(split.conservation.delta_amount)).toBeLessThanOrEqual(0.01);
  });
});
