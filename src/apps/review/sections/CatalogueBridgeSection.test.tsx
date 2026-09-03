// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { BridgePayload } from '../review.types';
import { CatalogueBridgeSection } from './CatalogueBridgeSection';

afterEach(cleanup);

const mockBridgePayload: BridgePayload = {
  resource: 'bridge',
  fy: 'FY26',
  compare: 'FY25',
  truncated: false,
  truncated_fys: [],
  conservation: { ok: true, delta_count: 0, delta_amount: 0 },
  volume_ticket: {
    volume: -118_600,
    ticket: -45_100,
    delta: -163_700,
    prev: { amount: 1_067_900, count: 63, ticket: 16_950 },
    curr: { amount: 904_200, count: 56, ticket: 16_146 },
    conservation: { ok: true, delta_amount: 0 },
  },
  owner: {
    active: { label: 'Commerciaux actifs', prev: 500_000, curr: 800_000, delta: 300_000 },
    dg: { label: 'PDG', prev: 300_000, curr: 50_000, delta: -250_000 },
    departed: { label: 'Commerciaux partis', prev: 200_000, curr: 0, delta: -200_000 },
    total: -150_000,
    conservation: { ok: true, delta_amount: 0 },
  },
  catalogue: {
    renew: -333_700,
    volume: -173_600,
    ticket: -84_300,
    total: -591_600,
    delta: -591_600,
    share_renew: 0.564,
    share_new: 0.436,
    prev: { new: { amount: 716_200, count: 33 }, renew: { amount: 800_000, count: 40 } },
    curr: { new: { amount: 458_300, count: 25 }, renew: { amount: 466_300, count: 25 } },
    conservation: { ok: true, delta_amount: 0 },
  },
  by_product: {
    catalogue: {
      renew: -333_700,
      volume: -173_600,
      ticket: -84_300,
      total: -591_600,
      delta: -591_600,
      share_renew: 0.564,
      share_new: 0.436,
      prev: { new: { amount: 716_200, count: 33 }, renew: { amount: 800_000, count: 40 } },
      curr: { new: { amount: 458_300, count: 25 }, renew: { amount: 466_300, count: 25 } },
      conservation: { ok: true, delta_amount: 0 },
    },
    sur_mesure: {
      renew: 50_000,
      volume: 10_000,
      ticket: -20_000,
      total: 40_000,
      delta: 40_000,
      share_renew: 0.6,
      share_new: 0.4,
      prev: { new: { amount: 100_000, count: 5 }, renew: { amount: 50_000, count: 2 } },
      curr: { new: { amount: 90_000, count: 6 }, renew: { amount: 100_000, count: 4 } },
      conservation: { ok: true, delta_amount: 0 },
    },
    conseil: {
      renew: -10_000,
      volume: 5_000,
      ticket: -5_000,
      total: -10_000,
      delta: -10_000,
      share_renew: 0.5,
      share_new: 0.5,
      prev: { new: { amount: 50_000, count: 3 }, renew: { amount: 20_000, count: 1 } },
      curr: { new: { amount: 50_000, count: 4 }, renew: { amount: 10_000, count: 1 } },
      conservation: { ok: true, delta_amount: 0 },
    },
  },
};

describe('CatalogueBridgeSection', () => {
  it('affiche par défaut Écart catalogue avec ses onglets', () => {
    render(<CatalogueBridgeSection data={mockBridgePayload} loading={false} />);
    expect(screen.getByText('Écart catalogue')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Catalogue' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Sur-mesure' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Conseil' })).toBeTruthy();
    expect(screen.getByText('Waterfall catalogue FY25 → FY26')).toBeTruthy();
  });

  it('bascule sur Sur-mesure au clic sur l onglet', () => {
    render(<CatalogueBridgeSection data={mockBridgePayload} loading={false} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Sur-mesure' }));
    expect(screen.getByText('Écart sur-mesure')).toBeTruthy();
    expect(screen.getByText('Waterfall sur-mesure FY25 → FY26')).toBeTruthy();
  });

  it('bascule sur Conseil au clic sur l onglet', () => {
    render(<CatalogueBridgeSection data={mockBridgePayload} loading={false} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Conseil' }));
    expect(screen.getByText('Écart conseil')).toBeTruthy();
    expect(screen.getByText('Waterfall conseil FY25 → FY26')).toBeTruthy();
  });
});
