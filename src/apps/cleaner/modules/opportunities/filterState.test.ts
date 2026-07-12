import { describe, expect, it } from 'vitest';
import {
  createInitialOpportunityFilters,
  matchesOpportunityFilters,
  type OpportunityFilters,
} from './filterState';
import type { OpportunityDiagnostic } from './types';

const opportunity = (
  overrides: Partial<OpportunityDiagnostic> = {},
): OpportunityDiagnostic => ({
  id: 'opp-1',
  name: 'Alpha',
  owner: 'Alice',
  category: 'amount',
  type_vente: 'New business',
  anomalies: [
    {
      ruleId: 'opportunity.amount.missing',
      severity: 'critical',
      score: 6,
      label: 'Montant manquant',
      evidence: [
        { field: 'amount', actual: null, expected: 'Un montant est requis' },
      ],
    },
    {
      ruleId: 'opportunity.owner.inactive',
      severity: 'critical',
      score: 10,
      label: 'Propriétaire inactif',
      evidence: [
        { field: 'owner', actual: 'Alice', expected: 'Propriétaire actif' },
      ],
    },
  ],
  score: 42,
  ...overrides,
});

describe('opportunity filters', () => {
  it('matches search, owner, category and sale type filters', () => {
    const filters: OpportunityFilters = {
      ...createInitialOpportunityFilters(),
      search: 'alpha',
      owners: ['Alice'],
      categories: ['amount'],
      saleTypes: ['New business'],
    };

    expect(matchesOpportunityFilters(opportunity(), filters)).toBe(true);
    expect(
      matchesOpportunityFilters(opportunity({ owner: 'Bob' }), filters),
    ).toBe(false);
    expect(
      matchesOpportunityFilters(opportunity({ name: 'Beta' }), filters),
    ).toBe(false);
  });

  it('uses OR within a reason family and AND between reason families', () => {
    const base = createInitialOpportunityFilters();
    const filters: OpportunityFilters = {
      ...base,
      reasonFamilies: {
        amount: [
          'opportunity.amount.missing',
          'opportunity.amount.implausible',
        ],
        owner: ['opportunity.owner.inactive'],
      },
    };

    expect(matchesOpportunityFilters(opportunity(), filters)).toBe(true);
    expect(
      matchesOpportunityFilters(
        opportunity({
          anomalies: [opportunity().anomalies[0]],
        }),
        filters,
      ),
    ).toBe(false);
    expect(
      matchesOpportunityFilters(
        opportunity({
          anomalies: [opportunity().anomalies[1]],
        }),
        {
          ...filters,
          reasonFamilies: { amount: ['opportunity.amount.missing'] },
        },
      ),
    ).toBe(false);
  });
});
