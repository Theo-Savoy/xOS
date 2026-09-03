// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { BridgePayload, ProductPayload } from '../review.types';
import { ProductSection } from './ProductSection';

afterEach(cleanup);

const mockProductPayload: ProductPayload = {
  resource: 'product',
  fy: 'FY26',
  truncated: false,
  truncated_fys: [],
  conservation: { ok: true, delta_count: 0, delta_amount: 0 },
  series: [
    {
      fy: 'FY25',
      amountNew: 1_000_000,
      amountRenew: 800_000,
      amountTotal: 1_800_000,
      conservation: { ok: true, delta_count: 0, delta_amount: 0 },
      products: {
        catalogue: {
          key: 'catalogue',
          label: 'Catalogue',
          closed: 100,
          won: 30,
          closing: 0.3,
          amountNew: 700_000,
          amountRenew: 800_000,
          amount_total: 1_500_000,
          new: 30,
          renew: 40,
          total_signatures: 70,
          median: 45,
          mean: 60,
          n_cycle: 30,
          n_excluded: 0,
        },
        sur_mesure: {
          key: 'sur_mesure',
          label: 'Sur-mesure',
          closed: 40,
          won: 10,
          closing: 0.25,
          amountNew: 200_000,
          amountRenew: 0,
          amount_total: 200_000,
          new: 10,
          renew: 0,
          total_signatures: 10,
          median: 90,
          mean: 110,
          n_cycle: 10,
          n_excluded: 0,
        },
        conseil: {
          key: 'conseil',
          label: 'Conseil',
          closed: 20,
          won: 5,
          closing: 0.25,
          amountNew: 100_000,
          amountRenew: 0,
          amount_total: 100_000,
          new: 5,
          renew: 0,
          total_signatures: 5,
          median: 30,
          mean: 35,
          n_cycle: 5,
          n_excluded: 0,
        },
        autre: {
          key: 'autre',
          label: 'Autre / non défini',
          closed: 0,
          won: 0,
          closing: null,
          amountNew: 0,
          amountRenew: 0,
          amount_total: 0,
          new: 0,
          renew: 0,
          total_signatures: 0,
          median: null,
          mean: null,
          n_cycle: 0,
          n_excluded: 0,
        },
      },
    },
    {
      fy: 'FY26',
      amountNew: 900_000,
      amountRenew: 500_000,
      amountTotal: 1_400_000,
      conservation: { ok: true, delta_count: 0, delta_amount: 0 },
      products: {
        catalogue: {
          key: 'catalogue',
          label: 'Catalogue',
          closed: 90,
          won: 25,
          closing: 25 / 90,
          amountNew: 500_000,
          amountRenew: 500_000,
          amount_total: 1_000_000,
          new: 25,
          renew: 30,
          total_signatures: 55,
          median: 50,
          mean: 65,
          n_cycle: 25,
          n_excluded: 0,
        },
        sur_mesure: {
          key: 'sur_mesure',
          label: 'Sur-mesure',
          closed: 50,
          won: 15,
          closing: 0.3,
          amountNew: 300_000,
          amountRenew: 0,
          amount_total: 300_000,
          new: 15,
          renew: 0,
          total_signatures: 15,
          median: 80,
          mean: 100,
          n_cycle: 15,
          n_excluded: 0,
        },
        conseil: {
          key: 'conseil',
          label: 'Conseil',
          closed: 25,
          won: 6,
          closing: 0.24,
          amountNew: 100_000,
          amountRenew: 0,
          amount_total: 100_000,
          new: 6,
          renew: 0,
          total_signatures: 6,
          median: 32,
          mean: 38,
          n_cycle: 6,
          n_excluded: 0,
        },
        autre: {
          key: 'autre',
          label: 'Autre / non défini',
          closed: 0,
          won: 0,
          closing: null,
          amountNew: 0,
          amountRenew: 0,
          amount_total: 0,
          new: 0,
          renew: 0,
          total_signatures: 0,
          median: null,
          mean: null,
          n_cycle: 0,
          n_excluded: 0,
        },
      },
    },
  ],
};

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
    active: {
      label: 'Commerciaux actifs',
      prev: 500_000,
      curr: 800_000,
      delta: 300_000,
    },
    dg: { label: 'PDG', prev: 300_000, curr: 50_000, delta: -250_000 },
    departed: {
      label: 'Commerciaux partis',
      prev: 200_000,
      curr: 0,
      delta: -200_000,
    },
    total: -150_000,
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
      prev: {
        new: { amount: 716_200, count: 33 },
        renew: { amount: 800_000, count: 40 },
      },
      curr: {
        new: { amount: 458_300, count: 25 },
        renew: { amount: 466_300, count: 25 },
      },
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
      prev: {
        new: { amount: 100_000, count: 5 },
        renew: { amount: 50_000, count: 2 },
      },
      curr: {
        new: { amount: 90_000, count: 6 },
        renew: { amount: 100_000, count: 4 },
      },
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
      prev: {
        new: { amount: 50_000, count: 3 },
        renew: { amount: 20_000, count: 1 },
      },
      curr: {
        new: { amount: 50_000, count: 4 },
        renew: { amount: 10_000, count: 1 },
      },
      conservation: { ok: true, delta_amount: 0 },
    },
  },
};

describe('ProductSection', () => {
  function renderSection() {
    return render(
      <ProductSection
        product={mockProductPayload}
        bridge={mockBridgePayload}
        loading={false}
        compare="FY25"
      />,
    );
  }

  it('affiche le titre Vue globale par produit et les 3 onglets', () => {
    renderSection();
    expect(screen.getByText('Vue globale par produit')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Catalogue' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Sur-mesure' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Conseil' })).toBeTruthy();
  });

  it('affiche un seul tableau avec comparaison et écart', () => {
    renderSection();
    expect(screen.getByText('Indicateur')).toBeTruthy();
    expect(screen.getByText('Écart')).toBeTruthy();
    expect(
      screen.getByText('Opportunités fermées nouvelles affaires'),
    ).toBeTruthy();
    expect(screen.getByText('CA nouvelles affaires')).toBeTruthy();
  });

  it('rassemble tableau, écart et waterfall sous un seul sélecteur', () => {
    renderSection();
    expect(screen.getByText(/Indicateurs catalogue/)).toBeTruthy();
    expect(screen.getByText('Delta renouvellements')).toBeTruthy();
    expect(screen.getByText('Waterfall catalogue FY25 → FY26')).toBeTruthy();
    expect(screen.getAllByRole('tablist')).toHaveLength(1);
  });

  it('bascule tableau et waterfall ensemble sur Sur-mesure', () => {
    renderSection();
    fireEvent.click(screen.getByRole('tab', { name: 'Sur-mesure' }));
    expect(screen.getByText(/Indicateurs sur-mesure/)).toBeTruthy();
    expect(screen.getByText('Waterfall sur-mesure FY25 → FY26')).toBeTruthy();
  });

  it('bascule sur Conseil au clic sur l onglet', () => {
    renderSection();
    fireEvent.click(screen.getByRole('tab', { name: 'Conseil' }));
    expect(screen.getByText(/Indicateurs conseil/)).toBeTruthy();
    expect(screen.getByText('Waterfall conseil FY25 → FY26')).toBeTruthy();
  });

  it('garde le tableau quand le bridge est absent', () => {
    render(
      <ProductSection
        product={mockProductPayload}
        bridge={null}
        loading={false}
        compare="FY25"
      />,
    );
    expect(screen.getByText(/Indicateurs catalogue/)).toBeTruthy();
    expect(
      screen.getByText(/Écart catalogue indisponible/),
    ).toBeTruthy();
  });
});
