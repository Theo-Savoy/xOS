// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpportunitiesAnalyticsView } from './OpportunitiesAnalyticsView';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const analytics = {
  period: { label: 'Juillet 2026', today: '2026-07-13' },
  totals: {
    totalItems: 4,
    affectedItems: 4,
    anomalies: 7,
    amount: 125000,
    overdue: 2,
    overdueAmount: 50000,
    inactiveOwners: 1,
    amountIncoherent: 2,
  },
  ownerDistribution: [
    {
      ownerId: 'owner-1',
      owner: 'Alice',
      label: 'Alice',
      count: 3,
      amount: 90000,
      active: true,
    },
  ],
  stageDistribution: [
    {
      stage: 'Proposal',
      label: 'Proposal',
      key: 'Proposal',
      count: 2,
      amount: 70000,
    },
  ],
  overdueDistribution: [
    { bucket: 'over_1_year', label: 'over_1_year', count: 1, amount: 30000 },
  ],
  reasonDistribution: [
    {
      ruleId: 'opportunity.amount.missing',
      label: 'Montant manquant',
      count: 2,
      amount: 10000,
    },
  ],
  anomalyEvolution: [
    { period: '2026-07', anomalies: 7, corrections: 2, resolved: 1, failed: 1 },
  ],
  corrections: { total: 2, resolved: 1, failed: 1, resolutionRate: 0.5 },
};

describe('OpportunitiesAnalyticsView', () => {
  it('renders distributions, trends, period and navigates to matching cleaning filters', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ analytics, workspace: { items: [] } }),
            { status: 200 },
          ),
        ),
    );
    const onNavigateToCleaning = vi.fn();
    render(
      <OpportunitiesAnalyticsView
        accessToken="token"
        onNavigateToCleaning={onNavigateToCleaning}
      />,
    );

    expect(screen.getByRole('status')).toBeTruthy();
    expect(await screen.findByText('Juillet 2026')).toBeTruthy();
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText('Proposal')).toBeTruthy();
    expect(screen.getByText('Montant manquant')).toBeTruthy();
    expect(screen.getByText(/taux de résolution/i)).toBeTruthy();
    expect(screen.queryByText(/score global|santé globale/i)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Alice/i }));
    expect(onNavigateToCleaning).toHaveBeenCalledWith({ owners: ['Alice'] });
    fireEvent.click(screen.getByRole('button', { name: /Proposal/i }));
    expect(onNavigateToCleaning).toHaveBeenCalledWith({ search: 'Proposal' });
    fireEvent.click(screen.getByRole('button', { name: /Montant manquant/i }));
    expect(onNavigateToCleaning).toHaveBeenCalledWith({
      reasonFamilies: { amount: ['opportunity.amount.missing'] },
    });
  });

  it('shows an explicit API error and supports refresh', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: 'timeout', message: 'Service indisponible' }),
          { status: 504 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            analytics: {
              ...analytics,
              totals: { ...analytics.totals, anomalies: 0 },
            },
            workspace: { items: [] },
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    render(
      <OpportunitiesAnalyticsView
        accessToken="token"
        onNavigateToCleaning={vi.fn()}
      />,
    );

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Service indisponible',
    );
    fireEvent.click(screen.getByRole('button', { name: /actualiser/i }));
    await waitFor(() => expect(screen.getByText('Juillet 2026')).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
