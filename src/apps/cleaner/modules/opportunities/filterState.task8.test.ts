import { describe, expect, it } from 'vitest';
import { retainFailedSelection } from './filterState';

describe('opportunity command selection reconciliation', () => {
  it('removes successful ids and keeps failed ids after a partial result', () => {
    expect(
      retainFailedSelection(new Set(['one', 'two', 'three']), ['one', 'three']),
    ).toEqual(new Set(['two']));
  });
});
