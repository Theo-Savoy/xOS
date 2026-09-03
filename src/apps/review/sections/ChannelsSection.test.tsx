// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ChannelsPayload } from '../review.types';
import { ChannelsSection } from './ChannelsSection';

afterEach(cleanup);

const payload: ChannelsPayload = {
  resource: 'channels',
  fy: 'FY26',
  truncated: false,
  truncated_fys: [],
  conservation: { ok: true, delta_count: 0, delta_amount: 0 },
  channels: {
    items: [
      {
        label: 'Inbound web',
        closed: 20,
        won: 8,
        amount: 120_000,
        closing: 0.4,
        closing_pct: 40,
      },
      {
        label: 'Partenaires',
        closed: 10,
        won: 3,
        amount: 80_000,
        closing: 0.3,
        closing_pct: 30,
      },
    ],
    n_displayed: 2,
    n_total: 2,
    truncated: false,
  },
  concentration: {
    items: [
      { rank: 1, name: 'Compte A', amount: 50_000, pct: 20 },
      { rank: 2, name: 'Compte B', amount: 30_000, pct: 12 },
    ],
    top1_pct: 20,
    top5_pct: 32,
    topN_pct: 32,
    n_displayed: 15,
    n_total: 40,
    truncated: true,
    total: 250_000,
  },
  sdr_limit: 'Limite SDR de test.',
};

describe('ChannelsSection', () => {
  it('affiche Top 15, le graphique et les libellés français', () => {
    render(<ChannelsSection data={payload} loading={false} />);
    expect(screen.getByText('Top 15')).toBeTruthy();
    expect(screen.getByText('Canaux par CA')).toBeTruthy();
    expect(screen.getByText('Détail des canaux')).toBeTruthy();
    expect(screen.queryByText('Canaux NEW')).toBeNull();
    expect(screen.getByText(/Top 15 sur 40 comptes/)).toBeTruthy();
  });

  it('bascule la métrique du graphique vers Signatures', () => {
    render(<ChannelsSection data={payload} loading={false} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Signatures' }));
    expect(screen.getByText('Canaux par signatures')).toBeTruthy();
  });
});
