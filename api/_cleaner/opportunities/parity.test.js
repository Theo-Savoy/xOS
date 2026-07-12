import { describe, expect, it } from 'vitest';
import opportunitiesFixture from './__fixtures__/legacy-opportunities.json';
import metaFixture from './__fixtures__/legacy-meta.json';

const REQUIRED_RULE_IDS = [
  'close_date_overdue_over_1_year',
  'close_date_overdue_6_to_12_months',
  'close_date_overdue_3_to_6_months',
  'close_date_overdue_under_3_months',
  'activity_never_recorded',
  'activity_inactive_over_1_year',
  'activity_inactive_over_3_months',
  'activity_inactive_over_30_days',
  'amount_missing',
  'probability_zero',
  'owner_inactive',
  'owner_former_employee',
  'opportunity_created_over_2_years',
  'opportunity_created_over_1_year',
  'stage_suspect_stalled',
  'amount_implausible',
];

const REQUIRED_LEGACY_BULK_ACTIONS = [
  'reassign_owner',
  'reassign_account_owner',
  'update_close_date',
  'update_stage',
  'update_sale_type',
  'update_multiple_fields',
  'close_lost_with_compatible_reason',
  'close_lost_with_incompatible_reason_excluded',
];

const REQUIRED_PARITY_CAPABILITIES = [
  'kpis',
  'owner_stage_overdue_reasons_summary',
  'score_and_help',
  'sort_pagination_search',
  'owner_category_type_filters',
  'reason_filter_or_within_and_between_families',
  'persistent_selection',
  'select_all_filtered_results',
  'owner_close_date_stage_sale_type_actions',
  'account_owner_reassignment',
  'close_lost',
  'partial_results',
  'history',
  'prefiltered_clean_query',
  'refresh_and_cache',
  'xos_auth_and_salesforce_identity',
];

describe('legacy Cleaner parity contract', () => {
  it('freezes every legacy anomaly rule, including inactivity-only exclusion', () => {
    const fixtureRuleIds = new Set(
      opportunitiesFixture.opportunities.flatMap(
        (opportunity) => opportunity.expectedRuleIds,
      ),
    );

    expect([...fixtureRuleIds].sort()).toEqual([...REQUIRED_RULE_IDS].sort());
    expect(
      opportunitiesFixture.opportunities.find(
        (opportunity) => opportunity.id === 'OPP-ANON-INACTIVITY-ONLY',
      ),
    ).toMatchObject({ category: 'not_a_candidate', expectedRuleIds: [] });
  });

  it('freezes every legacy bulk action and dependent-picklist edge case', () => {
    expect(
      metaFixture.legacyBulkActions.map((action) => action.id).sort(),
    ).toEqual([...REQUIRED_LEGACY_BULK_ACTIONS].sort());
    expect(metaFixture.loss_valid_for['Type A only']).toEqual(['Type A']);
    expect(metaFixture.loss_valid_for['Type B only']).toEqual(['Type B']);
  });

  it('maps every line of the Labo §11 parity matrix to an executable future check', () => {
    expect([...metaFixture.parityMatrix].sort()).toEqual(
      [...REQUIRED_PARITY_CAPABILITIES].sort(),
    );
  });

  it('requires the future v2 rules engine to classify every frozen record', async () => {
    let rules;
    try {
      rules = await import('./rules.js');
    } catch {
      rules = null;
    }

    expect(
      rules,
      'Task 1 deliberately fails until Task 2 creates api/_cleaner/opportunities/rules.js. ' +
        'The future engine must expose detectOpportunityAnomalies(opportunity, context).',
    ).not.toBeNull();

    for (const opportunity of opportunitiesFixture.opportunities) {
      const anomalies = rules.detectOpportunityAnomalies(opportunity, {
        today: opportunitiesFixture.today,
        meta: metaFixture,
      });
      expect(anomalies.map((anomaly) => anomaly.ruleId).sort()).toEqual(
        [...opportunity.expectedRuleIds].sort(),
      );
    }
  });
});
