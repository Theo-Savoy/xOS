import { describe, expect, it } from 'vitest';
import {
  fyIntForDate,
  fyLabel,
  fyBounds,
  quarterIndex,
  quarterBounds,
  monthBounds,
  parsePeriod,
  priorPeriodLabel,
  prior2PeriodLabel,
} from './period.js';

describe('fyIntForDate', () => {
  it('returns next year - 2000 for July+', () => {
    expect(fyIntForDate(new Date('2026-07-01'))).toBe(27);
    expect(fyIntForDate(new Date('2026-12-31'))).toBe(27);
  });
  it('returns current year - 2000 for Jan-Jun', () => {
    expect(fyIntForDate(new Date('2026-01-01'))).toBe(26);
    expect(fyIntForDate(new Date('2026-06-30'))).toBe(26);
  });
});

describe('fyBounds', () => {
  it('returns July→July bounds', () => {
    expect(fyBounds(26)).toEqual({
      from: '2025-07-01',
      toExclusive: '2026-07-01',
    });
  });
  it('handles FY27', () => {
    expect(fyBounds(27)).toEqual({
      from: '2026-07-01',
      toExclusive: '2027-07-01',
    });
  });
});

describe('quarterBounds', () => {
  it('Q1 = Jul-Sep', () => {
    expect(quarterBounds(26, 1)).toEqual({
      from: '2025-07-01',
      toExclusive: '2025-10-01',
    });
  });
  it('Q2 = Oct-Dec', () => {
    expect(quarterBounds(26, 2)).toEqual({
      from: '2025-10-01',
      toExclusive: '2026-01-01',
    });
  });
  it('Q3 = Jan-Mar', () => {
    expect(quarterBounds(26, 3)).toEqual({
      from: '2026-01-01',
      toExclusive: '2026-04-01',
    });
  });
  it('Q4 = Apr-Jun', () => {
    expect(quarterBounds(26, 4)).toEqual({
      from: '2026-04-01',
      toExclusive: '2026-07-01',
    });
  });
});

describe('parsePeriod', () => {
  it('parses FY26', () => {
    const r = parsePeriod('FY26');
    expect(r?.from).toBe('2025-07-01');
    expect(r?.toExclusive).toBe('2026-07-01');
    expect(r?.granularity).toBe('year');
  });
  it('parses FY26-Q2', () => {
    const r = parsePeriod('FY26-Q2');
    expect(r?.from).toBe('2025-10-01');
    expect(r?.granularity).toBe('quarter');
  });
  it('parses 2026-03 (month)', () => {
    const r = parsePeriod('2026-03');
    expect(r?.from).toBe('2026-03-01');
    expect(r?.toExclusive).toBe('2026-04-01');
    expect(r?.granularity).toBe('month');
  });
  it('parses December month with year rollover', () => {
    const r = parsePeriod('2026-12');
    expect(r?.toExclusive).toBe('2027-01-01');
  });
  it('returns null for invalid input', () => {
    expect(parsePeriod(null)).toBeNull();
    expect(parsePeriod('')).toBeNull();
    expect(parsePeriod('garbage')).toBeNull();
  });
});

describe('priorPeriodLabel', () => {
  it('shifts FY back 1', () => {
    expect(priorPeriodLabel('FY26')).toBe('FY25');
    expect(priorPeriodLabel('FY26-Q2')).toBe('FY25-Q2');
  });
  it('shifts calendar periods back 1 year', () => {
    expect(priorPeriodLabel('2026-03')).toBe('2025-03');
    expect(priorPeriodLabel('2026-W14')).toBe('2025-W14');
  });
});

describe('prior2PeriodLabel', () => {
  it('shifts FY back 2', () => {
    expect(prior2PeriodLabel('FY26')).toBe('FY24');
  });
});
