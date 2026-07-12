import { describe, expect, it } from 'vitest';
import {
  CLEANER_SETTINGS_KEY,
  DEFAULT_CLEANER_SETTINGS,
  normalizeCleanerSettings,
} from './settings.js';

describe('normalizeCleanerSettings', () => {
  it('returns the exact Labo defaults when cleaner_v2 is absent', () => {
    const result = normalizeCleanerSettings([]);

    expect(result.settings).toEqual(DEFAULT_CLEANER_SETTINGS);
    expect(result.settings).toEqual({
      amountImplausibleMax: 100,
      closeDateCriticalDays: 90,
      opportunityOldDays: 365,
      opportunityVeryOldDays: 730,
      score: {
        overduePointEveryDays: 30,
        overdueCap: 12,
        neverActive: 8,
        inactive30Days: 2,
        inactive90Days: 5,
        inactive365Days: 5,
        amountMissing: 6,
        amountImplausible: 10,
        probabilityZero: 3,
        ownerInactive: 10,
        formerEmployee: 8,
        oldOpportunity: 2,
        veryOldOpportunity: 4,
        stalledStage: 3,
        amountPointEvery: 10000,
        amountCap: 5,
      },
    });
    expect(result.key).toBe(CLEANER_SETTINGS_KEY);
    expect(result.warnings).toEqual([]);
    expect(result.usedFallback).toBe(true);
  });

  it('normalizes a valid cleaner_v2 row without mutating it', () => {
    const value = structuredClone(DEFAULT_CLEANER_SETTINGS);
    value.score.overdueCap = 20;
    const row = { key: CLEANER_SETTINGS_KEY, value };

    const result = normalizeCleanerSettings([row]);

    expect(result.settings).toEqual(value);
    expect(result.warnings).toEqual([]);
    expect(result.usedFallback).toBe(false);
    expect(row.value).toEqual(value);
  });

  it.each([
    ['root value is not an object', { value: null }],
    [
      'a numeric setting is a string',
      { value: { ...DEFAULT_CLEANER_SETTINGS, amountImplausibleMax: '100' } },
    ],
    [
      'a threshold is negative',
      { value: { ...DEFAULT_CLEANER_SETTINGS, closeDateCriticalDays: -1 } },
    ],
    [
      'a nested score is missing',
      {
        value: {
          ...DEFAULT_CLEANER_SETTINGS,
          score: { ...DEFAULT_CLEANER_SETTINGS.score, amountCap: undefined },
        },
      },
    ],
    [
      'an unknown root key is present',
      { value: { ...DEFAULT_CLEANER_SETTINGS, unknown: 1 } },
    ],
  ])('falls back with an explicit warning when %s', (_description, row) => {
    const result = normalizeCleanerSettings([
      { key: CLEANER_SETTINGS_KEY, ...row },
    ]);

    expect(result.settings).toEqual(DEFAULT_CLEANER_SETTINGS);
    expect(result.usedFallback).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatchObject({ key: CLEANER_SETTINGS_KEY });
    expect(result.warnings[0].message).toEqual(expect.any(String));
  });

  it('warns when the stored rows container is invalid', () => {
    const result = normalizeCleanerSettings({
      key: CLEANER_SETTINGS_KEY,
      value: null,
    });

    expect(result.settings).toEqual(DEFAULT_CLEANER_SETTINGS);
    expect(result.warnings).toHaveLength(1);
    expect(result.usedFallback).toBe(true);
  });

  it('ignores unrelated setting rows', () => {
    const result = normalizeCleanerSettings([
      { key: 'weekly_targets', value: {} },
    ]);

    expect(result.settings).toEqual(DEFAULT_CLEANER_SETTINGS);
    expect(result.warnings).toEqual([]);
  });
});
