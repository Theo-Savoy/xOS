import { describe, expect, it } from 'vitest';
import fyWindow from './__fixtures__/fy-window.js';
import { computeCycles } from './cycles.js';

describe('computeCycles', () => {
  it('reproduit les cycles NEW FY26 globaux (P10)', () => {
    const { series } = computeCycles(fyWindow);
    const fy26 = series.find((row) => row.fy === 'FY26');
    expect(fy26).toBeDefined();
    expect(fy26.median).toBe(22);
    expect(fy26.mean).toBe(136);
    expect(fy26.n_valid).toBe(43);
    expect(fy26.n_excluded).toBe(13);
    expect(fy26.n_over_365).toBe(5);
    expect(fy26.n_over_730).toBe(3);
  });

  it('découpe les cycles FY26 par produit (§2.4)', () => {
    const { series } = computeCycles(fyWindow);
    const fy26 = series.find((row) => row.fy === 'FY26');
    expect(fy26.by_product.catalogue).toEqual(
      expect.objectContaining({ median: 68, mean: 242, n: 18 }),
    );
    expect(fy26.by_product.sur_mesure).toEqual(
      expect.objectContaining({ median: 17, mean: 70, n: 21 }),
    );
    expect(fy26.by_product.conseil).toEqual(
      expect.objectContaining({ median: 14, mean: 12, n: 3 }),
    );
  });
});
