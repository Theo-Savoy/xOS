import { describe, expect, it } from 'vitest';
import { GOAL_REACTION_EMOJIS } from './notifications';

describe('goal reaction palette', () => {
  it('contains the full twelve emoji palette', () => {
    expect(GOAL_REACTION_EMOJIS).toEqual([
      '👏',
      '🔥',
      '💪',
      '🎉',
      '🥳',
      '🙌',
      '💯',
      '⭐',
      '❤️',
      '🚀',
      '🤝',
      '💼',
    ]);
    expect(GOAL_REACTION_EMOJIS).toHaveLength(12);
  });
});
