import { describe, expect, it } from 'vitest';
import fyWindow from './__fixtures__/fy-window.js';
import { computeChannels } from './channels.js';

function within(actual, expected, tol) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tol);
}

describe('computeChannels', () => {
  const channels = computeChannels(fyWindow);

  it('somme des CA de tous les canaux ≈ CA NEW FY26 (905 vs 904 k€, ±2 k€) et expose n_displayed / n_total (P6)', () => {
    const sum = channels.channels.items.reduce(
      (acc, row) => acc + row.amount,
      0,
    );
    within(sum, 904_000, 2_000);
    within(sum, 905_000, 2_000);
    expect(channels.channels.n_displayed).toEqual(expect.any(Number));
    expect(channels.channels.n_total).toEqual(expect.any(Number));
    expect(channels.channels.n_displayed).toBeGreaterThan(0);
    expect(channels.channels.n_total).toBeGreaterThanOrEqual(
      channels.channels.n_displayed,
    );
  });

  it('concentration Top 1 = 19,7 % et Top 5 = 40,7 % (±0,1 pt), CA total RENEW inclus', () => {
    within(channels.concentration.top1_pct, 19.7, 0.1);
    within(channels.concentration.top5_pct, 40.7, 0.1);
    expect(channels.concentration.n_displayed).toEqual(expect.any(Number));
    expect(channels.concentration.n_total).toEqual(expect.any(Number));
    expect(channels.concentration.n_total).toBeGreaterThanOrEqual(
      channels.concentration.n_displayed,
    );
  });
});
