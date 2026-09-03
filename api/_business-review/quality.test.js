import { describe, expect, it } from 'vitest';
import fyWindow, { arrCohort } from './__fixtures__/fy-window.js';
import { catalogueBridge } from './bridge.js';
import { DEFAULT_FTE } from './fte-config.js';
import { computeMarket } from './market.js';
import { computeOverview } from './overview.js';
import { computePortfolio } from './portfolio.js';
import { computeQuality } from './quality.js';
import { PATTERN_IDS, computeSynthesis } from './synthesis.js';

describe('computeQuality', () => {
  it('reproduit les compteurs A8 FY26', () => {
    const quality = computeQuality(fyWindow);
    expect(quality.negative_cycles).toBe(13);
    expect(quality.over_365).toBe(5);
    expect(quality.over_730).toBe(3);
    expect(quality.missing_amount).toBe(0);
    expect(quality.won_total).toBe(101);
  });
});

describe('computeSynthesis', () => {
  it('les 4 cartes portent 1,681 M€ / −591,6 k€ / −52 % / 78,5 % et les 4 patterns du §18', () => {
    const overview = computeOverview(fyWindow);
    const catalogue = catalogueBridge(fyWindow.FY25.won, fyWindow.FY26.won);
    const market = computeMarket(fyWindow);
    const portfolio = computePortfolio(fyWindow, arrCohort);
    const synthesis = computeSynthesis({
      overview,
      catalogue,
      fte: DEFAULT_FTE,
      market,
      portfolio,
    });

    expect(synthesis.cards).toHaveLength(4);
    expect(synthesis.cards.map((card) => card.display)).toEqual([
      '1,681 M€',
      '−591,6 k€',
      '−52 %',
      '78,5 %',
    ]);
    expect(synthesis.patterns).toHaveLength(4);
    expect(synthesis.patterns.map((row) => row.id)).toEqual(PATTERN_IDS);
    expect(PATTERN_IDS).toEqual([
      'new-renew',
      'clients-existants',
      'catalogue-renew',
      'signal-marche',
    ]);
  });
});
