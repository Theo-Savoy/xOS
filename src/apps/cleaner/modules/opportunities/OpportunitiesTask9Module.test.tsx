// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { OpportunitiesModule } from './OpportunitiesModule';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('connects Synthèse navigation back to a filtered Nettoyage view', async () => {
  const workspace = {
    items: [
      {
        id: 'opp-1',
        name: 'Alpha',
        owner: 'Alice',
        owner_id: 'owner-1',
        stage: 'Proposal',
        amount: 100,
        probability: 50,
        score: 10,
        anomalies: [
          {
            ruleId: 'opportunity.amount.missing',
            severity: 'critical',
            score: 6,
            label: 'Montant manquant',
            evidence: [],
          },
        ],
      },
    ],
    total: 1,
    capabilities: {
      canViewTeam: true,
      canReassign: false,
      canBulkEdit: false,
      canBulkClose: false,
      canManageRules: false,
    },
  };
  const analytics = {
    analytics: {
      period: { label: 'Juillet 2026' },
      totals: { totalItems: 1, anomalies: 1 },
      ownerDistribution: [
        {
          ownerId: 'owner-1',
          owner: 'Alice',
          count: 1,
          amount: 100,
          active: true,
        },
      ],
      stageDistribution: [],
      overdueDistribution: [],
      reasonDistribution: [],
      anomalyEvolution: [],
      corrections: { total: 0, resolved: 0, resolutionRate: 0 },
    },
    workspace,
  };
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify(workspace), { status: 200 }),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify(analytics), { status: 200 }),
    );
  vi.stubGlobal('fetch', fetchMock);
  render(<OpportunitiesModule accessToken="token" />);
  await waitFor(() => expect(screen.getByText('Alpha')).toBeTruthy());
  fireEvent.click(screen.getByRole('button', { name: 'Synthèse' }));
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: /Alice · 1 éléments/i }),
    ).toBeTruthy(),
  );
  fireEvent.click(screen.getByRole('button', { name: /Alice · 1 éléments/i }));
  expect(
    screen
      .getByRole('button', { name: 'Nettoyage' })
      .getAttribute('aria-pressed'),
  ).toBe('true');
  expect(screen.getByText('Alpha')).toBeTruthy();
});
