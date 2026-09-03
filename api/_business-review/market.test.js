import { describe, expect, it } from 'vitest';
import fyWindow from './__fixtures__/fy-window.js';
import { computeMarket, twoProportionTest } from './market.js';

const CONCLUSION = "le signal domine sans prouver l'aggravation";

function fyShare(market, fy) {
  return market.share.find((row) => row.fy === fy);
}

describe('twoProportionTest', () => {
  it('FY25→FY26 : p ≈ 0,267 et z ≈ 1,11 (R14)', () => {
    const { p, z } = twoProportionTest(135, 185, 102, 130);
    expect(Math.abs(p - 0.267)).toBeLessThanOrEqual(0.005);
    expect(z).toBeCloseTo(1.11, 2);
  });
});

describe('computeMarket', () => {
  it('part marché/client FY24 = 67,2 % (180/268) et FY26 = 78,5 % (102/130)', () => {
    const market = computeMarket(fyWindow);
    const fy24 = fyShare(market, 'FY24');
    const fy26 = fyShare(market, 'FY26');
    expect(fy24.n_marche).toBe(180);
    expect(fy24.n_lost).toBe(268);
    expect(Math.abs(fy24.pct - 67.2)).toBeLessThanOrEqual(0.1);
    expect(fy26.n_marche).toBe(102);
    expect(fy26.n_lost).toBe(130);
    expect(Math.abs(fy26.pct - 78.5)).toBeLessThanOrEqual(0.1);
  });

  it('répartition FY26 par offre : les trois motifs somment à 100 % ± 0,1 pt', () => {
    const { mix } = computeMarket(fyWindow);
    for (const key of ['global', 'catalogue', 'sur_mesure']) {
      const row = mix[key];
      expect(row).toBeDefined();
      const sum = row.marche_pct + row.produit_pct + row.prix_pct;
      expect(Math.abs(sum - 100)).toBeLessThanOrEqual(0.1);
    }
  });

  it("renvoie la conclusion figée R14 à l'identique", () => {
    const market = computeMarket(fyWindow);
    expect(market.conclusion).toBe(CONCLUSION);
  });

  it('motifs de gain catalogue n=25 Prix 56,0 % ; sur-mesure n=27 Clés en main 29,6 %', () => {
    const { win_by_offer } = computeMarket(fyWindow);
    expect(win_by_offer.catalogue.n_total).toBe(25);
    const prix = win_by_offer.catalogue.items.find((row) => row.label === 'Prix');
    expect(prix).toEqual(expect.objectContaining({ count: 14 }));
    expect(Math.abs(prix.pct - 56.0)).toBeLessThanOrEqual(0.1);

    expect(win_by_offer.sur_mesure.n_total).toBe(27);
    const cles = win_by_offer.sur_mesure.items.find((row) =>
      /cl[eé]s en main/i.test(row.label),
    );
    expect(cles).toBeDefined();
    expect(Math.abs(cles.pct - 29.6)).toBeLessThanOrEqual(0.1);
  });

  it('expose n_displayed et n_total sur chaque table de motifs (P6)', () => {
    const market = computeMarket(fyWindow);
    const tables = [
      market.loss_reasons,
      market.win_reasons,
      market.win_by_offer.catalogue,
      market.win_by_offer.sur_mesure,
    ];
    for (const table of tables) {
      expect(table.n_displayed).toEqual(expect.any(Number));
      expect(table.n_total).toEqual(expect.any(Number));
      expect(table.n_displayed).toBeGreaterThan(0);
      expect(table.n_total).toBeGreaterThanOrEqual(table.n_displayed);
    }
  });
});
