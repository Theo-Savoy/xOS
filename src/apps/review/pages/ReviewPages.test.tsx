// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { PeriodSelection } from '../review.period';
import type { BridgePayload, SynthesisPayload } from '../review.types';
import {
  CommercialPage,
  DiagnosticPage,
  MarketPage,
  ProductPage,
  SummaryPage,
  TrajectoryPage,
} from './ReviewPages';

afterEach(cleanup);

const period: PeriodSelection = {
  mode: 'fy',
  fy: 'FY26',
  semester: 'S1',
};

const idle = { data: null, loading: false };

describe('pages du bilan', () => {
  it('porte le périmètre dans le titre de chaque page', () => {
    const { unmount: unmountSummary } = render(
      <SummaryPage
        period={period}
        synthesis={idle}
        overview={idle}
        bridge={idle}
      />,
    );
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(
      /CA total/,
    );
    unmountSummary();

    const { unmount: unmountTrajectory } = render(
      <TrajectoryPage period={period} overview={idle} portfolio={idle} />,
    );
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(
      /CA total/,
    );
    unmountTrajectory();

    const { unmount: unmountCommercial } = render(
      <CommercialPage period={period} commercial={idle} />,
    );
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(
      /CA NEW/,
    );
    unmountCommercial();

    const { unmount: unmountProduct } = render(
      <ProductPage
        period={period}
        product={idle}
        bridge={idle}
        cycles={idle}
      />,
    );
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(
      /CA NEW/,
    );
    unmountProduct();

    const { unmount: unmountMarket } = render(
      <MarketPage period={period} market={idle} channels={idle} />,
    );
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(
      /CA NEW/,
    );
    unmountMarket();

    render(
      <DiagnosticPage
        period={period}
        diagnosis={idle}
        quality={idle}
        definitions={idle}
      />,
    );
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(
      /CA total/,
    );
  });

  it('intègre les anciennes annexes dans les pages d’analyse', () => {
    const { unmount: unmountCommercial } = render(
      <CommercialPage period={period} commercial={idle} />,
    );
    expect(screen.getByText('Activité nominative indisponible')).toBeTruthy();
    expect(screen.getByText('Lecture PDG indisponible')).toBeTruthy();
    unmountCommercial();

    const { unmount: unmountTrajectory } = render(
      <TrajectoryPage period={period} overview={idle} portfolio={idle} />,
    );
    expect(screen.getByText('Historique indisponible')).toBeTruthy();
    unmountTrajectory();

    render(
      <DiagnosticPage
        period={period}
        diagnosis={idle}
        quality={idle}
        definitions={idle}
      />,
    );
    expect(screen.getByText('Qualité indisponible')).toBeTruthy();
    expect(screen.getByText('Contrats de calcul indisponibles')).toBeTruthy();
  });

  it('compose la Synthèse en grille hero puis patterns 2 colonnes', () => {
    const conservation = { ok: true, delta_count: 0, delta_amount: 0 };
    const synthesis: SynthesisPayload = {
      resource: 'synthesis',
      fy: 'FY26',
      compare: 'FY25',
      truncated: false,
      truncated_fys: [],
      conservation,
      cards: [
        {
          key: 'ca',
          label: 'CA total',
          display: '1 M€',
          value: 1,
          scope: 'total',
        },
        {
          key: 'new',
          label: 'CA NEW',
          display: '400 k€',
          value: 400,
          scope: 'new',
        },
      ],
      patterns: [
        { id: 'p1', title: 'Pattern 1', body: 'Corps 1' },
        { id: 'p2', title: 'Pattern 2', body: 'Corps 2' },
        { id: 'p3', title: 'Pattern 3', body: 'Corps 3' },
        { id: 'p4', title: 'Pattern 4', body: 'Corps 4' },
      ],
      verdict: 'Verdict de test',
      key_point: 'Point clé de synthèse',
    };
    const bridge: BridgePayload = {
      resource: 'bridge',
      fy: 'FY26',
      compare: 'FY25',
      truncated: false,
      truncated_fys: [],
      conservation,
      volume_ticket: {
        volume: -100,
        ticket: -50,
        delta: -150,
        prev: { amount: 500, count: 10, ticket: 50 },
        curr: { amount: 350, count: 8, ticket: 43.75 },
        conservation: { ok: true, delta_amount: 0 },
      },
      owner: {
        active: { label: 'Actifs', prev: 400, curr: 300, delta: -100 },
        dg: { label: 'PDG', prev: 80, curr: 50, delta: -30 },
        departed: { label: 'Partis', prev: 20, curr: 0, delta: -20 },
        total: -150,
        conservation: { ok: true, delta_amount: 0 },
      },
    };

    const { container } = render(
      <SummaryPage
        period={period}
        synthesis={{ data: synthesis, loading: false }}
        overview={idle}
        bridge={{ data: bridge, loading: false }}
      />,
    );

    const hero = container.querySelector('.review-page-grid--hero');
    expect(hero).toBeTruthy();
    expect(hero?.querySelectorAll(':scope > .review-section')).toHaveLength(2);
    expect(hero?.textContent).toMatch(/Quatre chiffres/);
    expect(hero?.textContent).toMatch(/Waterfall NEW/);

    const patterns = container.querySelector('.review-patterns-grid');
    expect(patterns).toBeTruthy();
    expect(patterns?.querySelectorAll('.review-pattern-card')).toHaveLength(4);
    expect(container.querySelector('.review-studies-grid')).toBeNull();
    expect(screen.getByText('Verdict de test')).toBeTruthy();
  });
});
