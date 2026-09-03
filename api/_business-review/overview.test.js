import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { computeOverview } from './overview.js';

const fyWindow = JSON.parse(
  readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      '__fixtures__/fy-window.json',
    ),
    'utf8',
  ),
);

describe('computeOverview', () => {
  it('reproduit FY26 §2.1 à ±500 € et expose FY22→FY26', () => {
    const overview = computeOverview(fyWindow);
    const fys = overview.series.map((row) => row.fy);
    expect(fys).toEqual(['FY22', 'FY23', 'FY24', 'FY25', 'FY26']);

    const fy26 = overview.series.find((row) => row.fy === 'FY26');
    expect(fy26).toBeDefined();
    expect(Math.abs(fy26.total - 1_681_000)).toBeLessThanOrEqual(500);
    expect(Math.abs(fy26.new - 904_000)).toBeLessThanOrEqual(500);
    expect(Math.abs(fy26.renew - 777_000)).toBeLessThanOrEqual(500);
    expect(fy26.conservation.ok).toBe(true);
    expect(fy26.other).toEqual(
      expect.objectContaining({
        count: expect.any(Number),
        amount: expect.any(Number),
      }),
    );
    expect(overview.conservation.ok).toBe(true);
  });
});
