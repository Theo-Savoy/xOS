import { describe, expect, it } from 'vitest';
import {
  addBurst,
  addLocalBurst,
  MAX_BURSTS,
  type FloatingReactionBurst,
} from './notificationsStore';

const burst = (id: string): FloatingReactionBurst => ({ id, emoji: '👏' });

describe('notificationsStore', () => {
  it('deduplicates bursts by id', () => {
    const existing = [burst('burst-1')];

    expect(addBurst(existing, burst('burst-1'))).toEqual(existing);
  });

  it('keeps only the newest concurrent bursts', () => {
    const existing = Array.from({ length: MAX_BURSTS }, (_, index) =>
      burst(`burst-${index}`),
    );

    const next = addBurst(existing, burst('burst-new'));

    expect(next).toHaveLength(MAX_BURSTS);
    expect(next[0]?.id).toBe('burst-1');
    expect(next.at(-1)?.id).toBe('burst-new');
  });

  it('caps and deduplicates local clicker bursts', () => {
    const existing = Array.from({ length: MAX_BURSTS }, (_, index) =>
      burst(`burst-${index}`),
    );

    expect(addLocalBurst(existing, burst('burst-2'))).toEqual(existing);

    const next = addLocalBurst(existing, burst('burst-local'));
    expect(next).toHaveLength(MAX_BURSTS);
    expect(next[0]?.id).toBe('burst-1');
    expect(next.at(-1)?.id).toBe('burst-local');
  });
});
