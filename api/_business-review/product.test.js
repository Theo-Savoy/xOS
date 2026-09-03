import { describe, expect, it } from 'vitest';
import fyWindow from './__fixtures__/fy-window.js';
import { computeProduct } from './product.js';

function fyRow(series, fy) {
  return series.find((row) => row.fy === fy);
}

describe('computeProduct', () => {
  it('reproduit le catalogue / sur-mesure / conseil FY26 (§2.4)', () => {
    const { series } = computeProduct(fyWindow);
    const fy26 = fyRow(series, 'FY26');
    expect(fy26).toBeDefined();

    expect(fy26.products.catalogue).toEqual(
      expect.objectContaining({
        closed: 110,
        won: 25,
        amountNew: 458_300,
      }),
    );
    expect(fy26.products.catalogue.closing).toBeCloseTo(0.227, 3);

    expect(fy26.products.sur_mesure).toEqual(
      expect.objectContaining({
        closed: 65,
        won: 27,
        amountNew: 313_000,
      }),
    );
    expect(fy26.products.sur_mesure.closing).toBeCloseTo(0.415, 3);

    expect(fy26.products.conseil).toEqual(
      expect.objectContaining({
        closed: 9,
        won: 3,
        amountNew: 129_000,
      }),
    );
    expect(fy26.products.conseil.closing).toBeCloseTo(0.333, 3);
  });

  it('expose « Autre / non défini » égal au reliquat NEW (P3)', () => {
    const { series } = computeProduct(fyWindow);
    const fy26 = fyRow(series, 'FY26');
    const known =
      fy26.products.catalogue.amountNew +
      fy26.products.sur_mesure.amountNew +
      fy26.products.conseil.amountNew;
    expect(fy26.products.autre).toEqual(
      expect.objectContaining({
        label: 'Autre / non défini',
      }),
    );
    expect(fy26.products.autre.amountNew).toBeCloseTo(
      fy26.amountNew - known,
      0,
    );
    expect(Math.abs(fy26.products.autre.amountNew - 3_700)).toBeLessThanOrEqual(
      100,
    );
  });

  it('compte le Conseil FY26 en 8 signatures = 3 NEW + 5 RENEW (R11)', () => {
    const { series } = computeProduct(fyWindow);
    const conseil = fyRow(series, 'FY26').products.conseil;
    expect(conseil.total_signatures).toBe(8);
    expect(conseil.new).toBe(3);
    expect(conseil.renew).toBe(5);
    expect(conseil.amount_total).toBe(354_600);
  });
});
