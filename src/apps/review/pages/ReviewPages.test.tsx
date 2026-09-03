// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { PeriodSelection } from '../review.period';
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
});
