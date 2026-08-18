// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getSession, onAuthStateChange } = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: { getSession, onAuthStateChange },
  },
}));

vi.mock('recharts', () => ({
  Bar: () => null,
  BarChart: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CartesianGrid: () => null,
  Cell: () => null,
  Pie: () => null,
  PieChart: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ResponsiveContainer: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

import ReviewApp from './ReviewApp';

const kpis = {
  ca_signe: 12000,
  pipeline_genere: 24000,
  pipeline_count: 2,
  closing_rate_count: 0.5,
  closing_rate_amount: 0.5,
  won_count: 1,
  closed_count: 2,
  lost_count: 1,
  by_owner: {},
  prior: null,
  prior2: null,
};

const responses: Record<string, unknown> = {
  kpis,
  breakdown: { by_type: {}, total_count: 0, total_amount: 0 },
  funnel: { stages: [], total: 0, conversion: {} },
  calls: {
    total: 0,
    per_week: [],
    funnel: { stages: [], total: 0, conversion: {} },
  },
  attention: { stale: [], key: [], hot: [] },
};

beforeEach(() => {
  getSession.mockResolvedValue({
    data: { session: { access_token: 'token' } },
  });
  onAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  });
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('resource=shared')) {
        return Promise.resolve(
          new Response(JSON.stringify({ error: 'internal_error' }), {
            status: 500,
          }),
        );
      }
      const resource = new URL(url, 'https://xos.test').searchParams.get(
        'resource',
      );
      return Promise.resolve(
        new Response(JSON.stringify(responses[resource || '']), {
          status: 200,
        }),
      );
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ReviewApp', () => {
  it('keeps the cockpit visible when the secondary shared-analysis request fails', async () => {
    render(<ReviewApp />);

    await waitFor(() => expect(screen.getByText('12 k€')).toBeTruthy());
    expect(screen.queryByText('http_500')).toBeNull();
    expect(screen.getByText('Cockpit')).toBeTruthy();
  });
});
