// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ProductPayload } from '../review.types';
import { ProductHistorySection } from './ProductHistorySection';

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

describe('ProductHistorySection', () => {
  it('affiche le titre Historique produit et les onglets', () => {
    render(<ProductHistorySection data={mockProductPayload} loading={false} />);
    expect(screen.getByText('Historique produit')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Catalogue' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Sur-mesure' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Conseil' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Tous' })).toBeTruthy();
  });

  it('affiche les colonnes simplifiées et lisibles', () => {
    render(<ProductHistorySection data={mockProductPayload} loading={false} />);
    expect(screen.getByText('Exercice')).toBeTruthy();
    expect(screen.getByText('Fermées')).toBeTruthy();
    expect(screen.getByText('Signatures')).toBeTruthy();
    expect(screen.getByText('Perdues')).toBeTruthy();
    expect(screen.getByText('Closing')).toBeTruthy();
    expect(screen.getByText('CA nouvelles affaires')).toBeTruthy();
    expect(screen.getByText('Cycle médian')).toBeTruthy();
  });

  it('permet de basculer sur Tous pour voir la colonne Produit', () => {
    render(<ProductHistorySection data={mockProductPayload} loading={false} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Tous' }));
    expect(screen.getByText('Produit')).toBeTruthy();
  });
});
