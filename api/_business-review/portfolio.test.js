import { describe, expect, it } from 'vitest';
import fyWindow, { arrCohort } from './__fixtures__/fy-window.js';
import { computePortfolio } from './portfolio.js';

function within(actual, expected, tol) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tol);
}

describe('computePortfolio', () => {
  const portfolio = computePortfolio(fyWindow, arrCohort);

  it('gagnés + fidélisés = CA total FY26 (389,1 + 1 292,0 = 1 681,1 k€, ±1 k€)', () => {
    const signed =
      portfolio.statuses.gagnes.amount + portfolio.statuses.fidelises.amount;
    within(portfolio.statuses.gagnes.amount, 389_100, 1_000);
    within(portfolio.statuses.fidelises.amount, 1_292_000, 1_000);
    within(signed, 1_681_100, 1_000);
  });

  it('perdus / ARR d’ouverture = 33,4 % (±0,002)', () => {
    const ratio =
      portfolio.statuses.perdus.amount / portfolio.cohort.arr;
    expect(ratio).toBeCloseTo(0.334, 3);
    within(ratio, 0.334, 0.002);
  });

  it('statuses (4 statuts, 148 comptes) et cohort (106 comptes) sont deux clés distinctes (P7)', () => {
    expect(portfolio.statuses).toBeDefined();
    expect(portfolio.cohort).toBeDefined();
    expect(portfolio.statuses).not.toBe(portfolio.cohort);

    const keys = Object.keys(portfolio.statuses);
    expect(keys).toEqual(
      expect.arrayContaining(['gagnes', 'fidelises', 'engages', 'perdus']),
    );
    const statusCount =
      portfolio.statuses.gagnes.count +
      portfolio.statuses.fidelises.count +
      portfolio.statuses.engages.count +
      portfolio.statuses.perdus.count;
    expect(statusCount).toBe(148);
    expect(portfolio.statuses.n_accounts).toBe(148);
    expect(portfolio.cohort.n_accounts).toBe(106);

    const summed = Object.values(portfolio).some((value) => {
      if (!value || typeof value !== 'object') return false;
      const n = Number(value.n_accounts);
      return n === 148 + 106 || n === 254;
    });
    expect(summed).toBe(false);
    expect(portfolio.total_accounts).toBeUndefined();
    expect(portfolio.n_accounts).toBeUndefined();
  });
});
