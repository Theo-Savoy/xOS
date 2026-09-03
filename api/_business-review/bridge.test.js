import { describe, expect, it } from 'vitest';
import fyWindow from './__fixtures__/fy-window.js';
import { catalogueBridge, ownerBridge, volumeTicketBridge } from './bridge.js';

function within(actual, expected, tol = 100) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tol);
}

describe('volumeTicketBridge', () => {
  it('décompose le NEW global FY25→FY26 (formule séquentielle §2.3)', () => {
    const result = volumeTicketBridge(
      { amount: 1_067_900, count: 63 },
      { amount: 904_200, count: 56 },
    );
    within(result.volume, -118_600);
    within(result.ticket, -45_100);
    within(result.volume + result.ticket, result.delta);
    expect(result.delta).toBe(904_200 - 1_067_900);
  });

  it('décompose le catalogue NEW FY25→FY26', () => {
    const result = volumeTicketBridge(
      { amount: 716_200, count: 33 },
      { amount: 458_300, count: 25 },
    );
    within(result.volume, -173_600);
    within(result.ticket, -84_300);
    within(result.volume + result.ticket, result.delta);
  });
});

describe('ownerBridge', () => {
  it('cadre le recul NEW : actifs − DG − partis = delta total (§2.2)', () => {
    const result = ownerBridge(fyWindow.FY25.won, fyWindow.FY26.won);
    within(result.active.delta, 309_400);
    within(result.dg.delta, -276_600);
    within(result.departed.delta, -196_500);
    within(
      result.active.delta + result.dg.delta + result.departed.delta,
      -163_700,
    );
  });
});

describe('catalogueBridge', () => {
  it('décompose le recul catalogue FY25→FY26 (R9, §2.2)', () => {
    const result = catalogueBridge(fyWindow.FY25.won, fyWindow.FY26.won);
    within(result.renew, -333_700);
    within(result.volume, -173_600);
    within(result.ticket, -84_300);
    within(result.renew + result.volume + result.ticket, -591_600);
    expect(result.share_renew * 100).toBeCloseTo(56.4, 1);
    expect(result.share_new * 100).toBeCloseTo(43.6, 1);
  });
});
