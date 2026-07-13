import { afterEach, describe, expect, it, vi } from 'vitest';
import { particlesFor } from './FloatingReactions';

describe('floating reaction particles', () => {
  afterEach(() => vi.restoreAllMocks());

  it('uses the slower duration range and wider drift', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);

    const [particle] = particlesFor('🎉');

    expect(particle?.duration).toBe('3.799s');
    expect(particle?.drift).toBe('89.82px');
  });
});
