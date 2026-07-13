import { describe, expect, it } from 'vitest';
import legacyOpportunities from './__fixtures__/legacy-opportunities.json';
import { computeOpportunityAnalytics } from './analytics.js';

function itemsFromFixture() {
  return legacyOpportunities.opportunities
    .filter((item) => item.expectedRuleIds.length > 0)
    .map((item) => ({
      ...item,
      anomalies: item.expectedRuleIds.map((ruleId) => ({ ruleId })),
      score: 1,
    }));
}

describe('computeOpportunityAnalytics', () => {
  it('keeps totals and distributions coherent with the items passed', () => {
    const items = itemsFromFixture();
    const result = computeOpportunityAnalytics(items, [], {
      today: legacyOpportunities.today,
    });

    expect(result.totals.totalItems).toBe(items.length);
    expect(result.totals.affectedItems).toBe(items.length);
    expect(result.totals.anomalies).toBe(
      items.reduce((total, item) => total + item.anomalies.length, 0),
    );
    expect(result.totals.amount).toBe(
      items.reduce((total, item) => total + (Number(item.amount) || 0), 0),
    );
    expect(
      result.ownerDistribution.reduce((total, row) => total + row.count, 0),
    ).toBe(items.length);
    expect(
      result.stageDistribution.reduce((total, row) => total + row.count, 0),
    ).toBe(items.length);
    expect(
      result.reasonDistribution.find((row) => row.ruleId === 'amount_missing')
        .count,
    ).toBeGreaterThan(0);
    expect(result).not.toHaveProperty('globalHealthScore');
  });

  it('reports correction and resolution evolution from history without adding inactivity-only records', () => {
    const items = itemsFromFixture();
    const result = computeOpportunityAnalytics(
      items,
      [
        {
          at: '2026-07-02T10:00:00Z',
          cleaner_action_targets: [{ success: true }, { success: false }],
        },
        {
          at: '2026-07-03T10:00:00Z',
          cleaner_action_targets: [{ success: true }],
        },
      ],
      {
        today: legacyOpportunities.today,
        start: '2026-07-01',
        end: '2026-07-31',
      },
    );

    expect(result.corrections).toMatchObject({
      total: 3,
      resolved: 2,
      failed: 1,
    });
    expect(result.corrections.resolutionRate).toBeCloseTo(2 / 3);
    expect(result.resolutionRate).toBeCloseTo(2 / 3);
    expect(result.anomalyEvolution).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          period: '2026-07',
          corrections: 3,
          resolved: 2,
        }),
      ]),
    );
    expect(result.totals.totalItems).toBe(items.length);
    expect(items.some((item) => item.expectedRuleIds.length === 0)).toBe(false);
  });

  it('returns a stable explicit empty result when workspace items and history are absent', () => {
    const result = computeOpportunityAnalytics([], [], { today: '2026-07-13' });

    expect(result.empty).toBe(true);
    expect(result.totals).toMatchObject({
      totalItems: 0,
      affectedItems: 0,
      anomalies: 0,
      amount: 0,
      overdue: 0,
    });
    expect(result.ownerDistribution).toEqual([]);
    expect(result.stageDistribution).toEqual([]);
    expect(result.anomalyEvolution).toEqual([]);
    expect(result.corrections).toMatchObject({
      total: 0,
      resolved: 0,
      failed: 0,
      resolutionRate: 0,
    });
  });
});
