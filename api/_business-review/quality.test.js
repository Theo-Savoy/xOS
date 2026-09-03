import { describe, expect, it } from 'vitest';
import fyWindow, { arrCohort } from './__fixtures__/fy-window.js';
import { catalogueBridge } from './bridge.js';
import { computeMarket } from './market.js';
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
  it('les 4 cartes FY portent croissance / mix / closing / cycle calculés', () => {
    const catalogue = catalogueBridge(fyWindow.FY25.won, fyWindow.FY26.won);
    const market = computeMarket(fyWindow);
    const portfolio = computePortfolio(fyWindow, arrCohort);
    const synthesis = computeSynthesis({
      window: fyWindow,
      fy: 'FY26',
      compare: 'FY25',
      semester: null,
      catalogue,
      market,
      portfolio,
    });

    expect(synthesis.cards).toHaveLength(4);
    expect(synthesis.cards.map((card) => card.key)).toEqual([
      'croissance',
      'mix-new',
      'closing',
      'cycle',
    ]);
    expect(synthesis.cards.map((card) => card.display)).toEqual([
      '−13,7 %',
      '53,8 % NEW',
      '30,1 %',
      '22 j',
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

  it('en mode semestre, les cartes comparent au même semestre N-1', () => {
    // Mini-fenêtre S1 (01/07 → 31/12) : FY26 = 300 k€ (NEW 100k + RENEW 200k),
    // FY25 = 400 k€ (NEW 250k + RENEW 150k) → croissance −25 %, mix 33,3 %.
    const window = {
      FY26: {
        won: [
          {
            Name: 'XOS - Nouveau client A',
            Amount: 100000,
            CreatedDate: '2025-08-01',
            CloseDate: '2025-09-15',
          },
          { Name: 'Renew client B', Amount: 200000, CloseDate: '2025-11-01' },
        ],
        closed: [
          { Name: 'Prospect C', CloseDate: '2025-08-20' },
          { Name: 'Prospect D', CloseDate: '2025-09-05' },
          { Name: 'Prospect E', CloseDate: '2025-10-01' },
          { Name: 'Prospect F', CloseDate: '2025-11-15' },
          { Name: 'Renew client G', CloseDate: '2025-12-01' },
        ],
        created: [],
      },
      FY25: {
        won: [
          {
            Name: 'XOS - Nouveau client H',
            Amount: 250000,
            CloseDate: '2024-10-01',
          },
          { Name: 'Renew client I', Amount: 150000, CloseDate: '2024-11-15' },
        ],
        closed: [],
        created: [],
      },
    };
    const synthesis = computeSynthesis({
      window,
      fy: 'FY26',
      compare: 'FY25',
      semester: 'S1',
    });

    expect(synthesis.cards.map((card) => card.display)).toEqual([
      '−25,0 %',
      '33,3 % NEW',
      '25,0 %',
      '45 j',
    ]);
    expect(synthesis.cards[0].hint).toContain('FY25 · S1');
    expect(synthesis.cards[0].hint).toContain('FY26 · S1');
  });
});
