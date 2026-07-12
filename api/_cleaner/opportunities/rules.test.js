import { describe, expect, it } from 'vitest';
import opportunitiesFixture from './__fixtures__/legacy-opportunities.json';
import metaFixture from './__fixtures__/legacy-meta.json';
import { detectOpportunityAnomalies } from './rules.js';
import { scoreOpportunity } from './score.js';

const TODAY = opportunitiesFixture.today;

const baseOpportunity = {
  id: 'OPP-TEST',
  close_date: '2026-08-01',
  amount: 3000,
  probability: 20,
  owner_active: true,
  stage: 'Qualification',
  created_date: '2026-01-20',
  last_activity: '2026-07-01',
  category: 'dechet',
};

function anomaliesFor(overrides = {}, context = {}) {
  return detectOpportunityAnomalies(
    { ...baseOpportunity, ...overrides },
    { today: TODAY, meta: metaFixture, ...context },
  );
}

function ruleIdsFor(overrides = {}, context = {}) {
  return anomaliesFor(overrides, context).map((anomaly) => anomaly.ruleId);
}

describe('detectOpportunityAnomalies', () => {
  it.each([
    ['close_date_overdue_over_1_year', { close_date: '2025-06-30' }],
    ['close_date_overdue_6_to_12_months', { close_date: '2025-12-01' }],
    ['close_date_overdue_3_to_6_months', { close_date: '2026-02-15' }],
    ['close_date_overdue_under_3_months', { close_date: '2026-06-20' }],
    ['amount_missing', { amount: null }],
    ['probability_zero', { probability: 0 }],
    ['owner_inactive', { owner_active: false }],
    ['owner_former_employee', { former_owner: true }],
    ['opportunity_created_over_2_years', { created_date: '2024-06-01' }],
    ['opportunity_created_over_1_year', { created_date: '2025-06-01' }],
    ['stage_suspect_stalled', { stage: 'Suspect enlisé' }],
    ['amount_implausible', { amount: 100 }],
  ])('detects %s', (ruleId, overrides) => {
    expect(ruleIdsFor(overrides)).toContain(ruleId);
  });

  it.each([
    ['close_date_overdue_over_1_year', { close_date: '2025-07-12' }],
    ['close_date_overdue_6_to_12_months', { close_date: '2026-01-13' }],
    ['close_date_overdue_3_to_6_months', { close_date: '2026-04-13' }],
    ['close_date_overdue_under_3_months', { close_date: '2026-07-12' }],
    ['amount_missing', { amount: 1 }],
    ['probability_zero', { probability: 20 }],
    ['owner_inactive', { owner_active: true }],
    ['owner_former_employee', { former_owner: false }],
    ['opportunity_created_over_2_years', { created_date: '2024-07-12' }],
    ['opportunity_created_over_1_year', { created_date: '2025-07-12' }],
    ['stage_suspect_stalled', { stage: 'Qualification' }],
    ['amount_implausible', { amount: 101 }],
  ])('does not detect %s outside its boundary', (ruleId, overrides) => {
    expect(ruleIdsFor(overrides)).not.toContain(ruleId);
  });

  it.each([
    ['activity_never_recorded', { last_activity: '' }],
    ['activity_inactive_over_1_year', { last_activity: '2025-06-01' }],
    ['activity_inactive_over_3_months', { last_activity: '2026-03-01' }],
    ['activity_inactive_over_30_days', { last_activity: '2026-05-31' }],
  ])('adds %s only after an objective anomaly exists', (ruleId, overrides) => {
    expect(ruleIdsFor({ close_date: '2026-06-20', ...overrides })).toContain(
      ruleId,
    );
    expect(ruleIdsFor(overrides)).not.toContain(ruleId);
  });

  it('does not enter Labo for inactivity alone', () => {
    expect(
      anomaliesFor({ last_activity: null, days_since_activity: 9999 }),
    ).toEqual([]);
  });

  it('uses context metadata for the stalled stage and former owners', () => {
    const anomalies = anomaliesFor(
      { stage: 'Blocked', former_owner: false, owner_id: 'USR-FORMER' },
      { stalledStage: 'Blocked', formerOwnerIds: ['USR-FORMER'] },
    );

    expect(
      ruleIdsFor(
        { stage: 'Blocked', former_owner: false, owner_id: 'USR-FORMER' },
        {
          stalledStage: 'Blocked',
          formerOwnerIds: ['USR-FORMER'],
        },
      ),
    ).toEqual(['owner_former_employee', 'stage_suspect_stalled']);
    expect(
      anomalies.every((anomaly) =>
        ['warning', 'critical'].includes(anomaly.severity),
      ),
    ).toBe(true);
    expect(
      anomalies.every((anomaly) => typeof anomaly.score === 'number'),
    ).toBe(true);
    expect(
      anomalies.every(
        (anomaly) =>
          typeof anomaly.label === 'string' && anomaly.label.length > 0,
      ),
    ).toBe(true);
    expect(
      anomalies.every(
        (anomaly) =>
          Array.isArray(anomaly.evidence) && anomaly.evidence.length > 0,
      ),
    ).toBe(true);
  });

  it('parses null and malformed dates without inventing an anomaly', () => {
    expect(
      ruleIdsFor({
        close_date: 'not-a-date',
        created_date: '2026-99-99',
        last_activity: 'invalid',
      }),
    ).toEqual([]);
  });

  it('accepts numeric strings and never mutates the opportunity', () => {
    const opportunity = { ...baseOpportunity, amount: '100', probability: '0' };
    const before = JSON.stringify(opportunity);

    expect(ruleIdsFor(opportunity)).toEqual([
      'amount_implausible',
      'probability_zero',
    ]);
    expect(JSON.stringify(opportunity)).toBe(before);
  });

  it('classifies every frozen fixture record', () => {
    for (const opportunity of opportunitiesFixture.opportunities) {
      expect(ruleIdsFor(opportunity).sort()).toEqual(
        [...opportunity.expectedRuleIds].sort(),
      );
    }
  });
});

describe('scoreOpportunity', () => {
  it('applies the exact default contribution values', () => {
    const anomalies = [
      'close_date_overdue_under_3_months',
      'activity_inactive_over_30_days',
      'amount_missing',
      'probability_zero',
      'owner_inactive',
      'owner_former_employee',
      'opportunity_created_over_1_year',
      'stage_suspect_stalled',
    ].map((ruleId) => ({ ruleId }));

    expect(
      scoreOpportunity(
        anomalies,
        {
          category: 'dechet',
          close_date: '2026-06-12',
          amount: 1200,
        },
        { today: TODAY },
      ),
    ).toBe(35.1);
  });

  it('uses injectable date and amount thresholds', () => {
    const thresholds = {
      today: '2026-07-12',
      overduePointEveryDays: 10,
      overdueCap: 4,
      amountPointEvery: 100,
      amountCap: 5,
    };

    expect(
      scoreOpportunity(
        [{ ruleId: 'close_date_overdue_under_3_months' }],
        { category: 'incoherent', close_date: '2026-06-01', amount: 1200 },
        thresholds,
      ),
    ).toBe(4);
    expect(
      scoreOpportunity(
        [],
        { category: 'dechet', close_date: '2026-08-01', amount: 1200 },
        thresholds,
      ),
    ).toBe(5);
  });

  it('does not add the amount scale to an incoherent-amount candidate', () => {
    expect(
      scoreOpportunity(
        [{ ruleId: 'amount_implausible' }],
        { category: 'incoherent', amount: 100 },
        { today: TODAY },
      ),
    ).toBe(10);
  });
});
