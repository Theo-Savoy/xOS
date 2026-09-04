import { describe, expect, it } from 'vitest';
import {
  ANNUAL_ONLY_FY,
  FY_OPTIONS,
  businessReviewPath,
  comparisonFy,
  fyBounds,
  fyEndLabel,
  isAnnualOnlySelection,
  periodQuery,
  periodRangeLabel,
  periodTitle,
  quarterBoundsFront,
  semesterBounds,
  seriesLabel,
  seriesSpanLabel,
} from './review.period';

describe('période du bilan', () => {
  it('expose FY22→FY26 dans le sélecteur', () => {
    expect(FY_OPTIONS.map((option) => option.value)).toEqual([
      'FY22',
      'FY23',
      'FY24',
      'FY25',
      'FY26',
    ]);
    expect(ANNUAL_ONLY_FY).toBe('FY26');
    expect(fyEndLabel(ANNUAL_ONLY_FY)).toBe('30/06/2026');
    expect(
      isAnnualOnlySelection({ mode: 'fy', fy: ANNUAL_ONLY_FY, semester: 'S1' }),
    ).toBe(true);
    expect(
      isAnnualOnlySelection({ mode: 'semester', fy: ANNUAL_ONLY_FY, semester: 'S1' }),
    ).toBe(false);
  });

  it('borne FY26 de juillet à juin', () => {
    expect(fyBounds('FY26')).toEqual({
      from: '2025-07-01',
      toExclusive: '2026-07-01',
    });
  });
  it('découpe les trimestres de juillet à juin', () => {
    expect(quarterBoundsFront('FY26', 'Q1')).toEqual({
      from: '2025-07-01',
      toExclusive: '2025-10-01',
    });
    expect(quarterBoundsFront('FY26', 'Q2')).toEqual({
      from: '2025-10-01',
      toExclusive: '2026-01-01',
    });
    expect(quarterBoundsFront('FY26', 'Q3')).toEqual({
      from: '2026-01-01',
      toExclusive: '2026-04-01',
    });
    expect(quarterBoundsFront('FY26', 'Q4')).toEqual({
      from: '2026-04-01',
      toExclusive: '2026-07-01',
    });
  });


  it('découpe S1 de juillet à décembre et S2 de janvier à juin', () => {
    expect(semesterBounds('FY26', 'S1')).toEqual({
      from: '2025-07-01',
      toExclusive: '2026-01-01',
    });
    expect(semesterBounds('FY26', 'S2')).toEqual({
      from: '2026-01-01',
      toExclusive: '2026-07-01',
    });
  });

  it('affiche les bornes inclusives pour le sélecteur', () => {
    expect(periodRangeLabel({ mode: 'fy', fy: 'FY26', semester: 'S1' })).toBe(
      '01/07/2025 → 30/06/2026',
    );
    expect(
      periodRangeLabel({ mode: 'semester', fy: 'FY26', semester: 'S1' }),
    ).toBe('01/07/2025 → 31/12/2025');
    expect(
      periodRangeLabel({ mode: 'semester', fy: 'FY26', semester: 'S2' }),
    ).toBe('01/01/2026 → 30/06/2026');
    expect(
      periodRangeLabel({ mode: 'quarter', fy: 'FY26', semester: 'S1', quarter: 'Q2' }),
    ).toBe('01/10/2025 → 31/12/2025');
  });

  it('compare toujours un exercice à N-1', () => {
    expect(comparisonFy('FY26')).toBe('FY25');
    expect(comparisonFy('FY22')).toBe('FY21');
  });

  it('n’envoie le semestre que dans ce mode et respecte compare', () => {
    expect(periodQuery({ mode: 'fy', fy: 'FY26', semester: 'S1' })).toEqual({
      fy: 'FY26',
      compare: 'FY25',
    });
    expect(
      periodQuery({ mode: 'fy', fy: 'FY26', semester: 'S1', compare: 'FY23' }),
    ).toEqual({
      fy: 'FY26',
      compare: 'FY23',
    });
    expect(
      periodQuery({ mode: 'semester', fy: 'FY26', semester: 'S2' }),
    ).toEqual({ fy: 'FY26', compare: 'FY25', semester: 'S2' });
    expect(
      periodQuery({ mode: 'quarter', fy: 'FY26', semester: 'S1', quarter: 'Q3' }),
    ).toEqual({ fy: 'FY26', compare: 'FY25', quarter: 'Q3' });
  });

  it('rend le comparatif explicite avec compare personnalisé', () => {
    expect(periodTitle({ mode: 'fy', fy: 'FY26', semester: 'S1' })).toBe(
      'FY25 → FY26',
    );
    expect(
      periodTitle({ mode: 'fy', fy: 'FY26', semester: 'S1', compare: 'FY24' }),
    ).toBe('FY24 → FY26');
    expect(periodTitle({ mode: 'semester', fy: 'FY26', semester: 'S1' })).toBe(
      'FY25 S1 → FY26 S1',
    );
    expect(periodTitle({ mode: 'quarter', fy: 'FY26', semester: 'S1', quarter: 'Q2' })).toBe(
      'FY25 T2 → FY26 T2',
    );
  });

  it('encode le semestre ou trimestre dans la requête API sans nouvelle resource', () => {
    expect(
      businessReviewPath('overview', {
        mode: 'semester',
        fy: 'FY26',
        semester: 'S2',
      }),
    ).toBe('/api/review?resource=overview&fy=FY26&compare=FY25&semester=S2');
    expect(
      businessReviewPath('overview', {
        mode: 'quarter',
        fy: 'FY26',
        semester: 'S2',
        quarter: 'Q3',
      }),
    ).toBe('/api/review?resource=overview&fy=FY26&compare=FY25&quarter=Q3');
  });

  it('étiquette une série FY26 en exercice, FY26 · S1 en semestre, FY26 · T3 en trimestre', () => {
    expect(seriesLabel('FY26')).toBe('FY26');
    expect(seriesLabel('FY26', { granularity: 'year', semester: null })).toBe(
      'FY26',
    );
    expect(
      seriesLabel('FY26', { granularity: 'semester', semester: 'S1' }),
    ).toBe('FY26 · S1');
    expect(seriesLabel('FY25', { mode: 'semester', semester: 'S2' })).toBe(
      'FY25 · S2',
    );
    expect(
      seriesLabel('FY26', { granularity: 'quarter', quarter: 'Q3' }),
    ).toBe('FY26 · T3');
    expect(seriesLabel('FY25', { mode: 'quarter', quarter: 'Q4' })).toBe(
      'FY25 · T4',
    );
  });

  it('étiquette une fenêtre FY22→FY26 en exercice, Série semestrielle S1 · FY22→FY26 en semestre, Série trimestrielle T3 en trimestre', () => {
    expect(seriesSpanLabel('FY22', 'FY26')).toBe('FY22→FY26');
    expect(
      seriesSpanLabel('FY22', 'FY26', { granularity: 'year', semester: null }),
    ).toBe('FY22→FY26');
    expect(
      seriesSpanLabel('FY22', 'FY26', {
        granularity: 'semester',
        semester: 'S1',
      }),
    ).toBe('Série semestrielle S1 · FY22→FY26');
    expect(
      seriesSpanLabel('FY22', 'FY26', { mode: 'semester', semester: 'S2' }),
    ).toBe('Série semestrielle S2 · FY22→FY26');
    expect(
      seriesSpanLabel('FY22', 'FY26', {
        granularity: 'quarter',
        quarter: 'Q3',
      }),
    ).toBe('Série trimestrielle T3 · FY22→FY26');
  });
});
