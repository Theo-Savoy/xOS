// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createPoolState } from '../domain/PoolState';
import { poolReducer } from './poolLogic';

describe('poolLogic — power dialing (lot 11.5)', () => {
  const queue = ['+33111111111', '+33222222222', '+33333333333', '+33444444444', '+33555555555'];

  it('Play compose min(size, restants) depuis la file', () => {
    const s = createPoolState(3, queue);
    const after = poolReducer(s, { type: 'play' });
    expect(after.running).toBe(true);
    expect(after.lines.map((l) => l.destination)).toEqual([
      '+33111111111',
      '+33222222222',
      '+33333333333',
    ]);
    expect(after.lines.every((l) => l.phase === 'dialing')).toBe(true);
    // La file avance : les 2 suivants restent.
    expect(after.queue).toEqual(['+33444444444', '+33555555555']);
  });

  it('Play ne relance pas si un cycle est déjà actif', () => {
    const s = poolReducer(createPoolState(3, queue), { type: 'play' });
    const again = poolReducer(s, { type: 'play' });
    expect(again).toBe(s);
  });

  it('Skip abandonne la ligne et compose le suivant de la file', () => {
    const s = poolReducer(createPoolState(3, queue), { type: 'play' });
    const after = poolReducer(s, { type: 'skip', slot: 1 });
    expect(after.lines[1].destination).toBe('+33444444444');
    expect(after.lines[1].phase).toBe('dialing');
    expect(after.queue).toEqual(['+33555555555']);
  });

  it('Skip sur la dernière file → ligne skipped', () => {
    let s = poolReducer(createPoolState(2, ['+33111111111']), { type: 'play' });
    s = poolReducer(s, { type: 'skip', slot: 0 });
    expect(s.lines[0].phase).toBe('skipped');
    expect(s.queue).toEqual([]);
  });

  it('onAnswered garde la ligne, coupe les autres (hangup)', () => {
    const s = poolReducer(createPoolState(3, queue), { type: 'play' });
    const after = poolReducer(s, { type: 'answered', slot: 2 });
    expect(after.lines[2].phase).toBe('connected');
    expect(after.connectedSlot).toBe(2);
    // Les autres lignes en cours sont coupées.
    expect(after.lines[0].phase).toBe('skipped');
    expect(after.lines[1].phase).toBe('skipped');
  });

  it('onAnswered ne touche pas aux lignes idle (slot non composé)', () => {
    const s = poolReducer(createPoolState(3, ['+33111111111']), { type: 'play' });
    const after = poolReducer(s, { type: 'answered', slot: 0 });
    expect(after.lines[1].phase).toBe('idle');
    expect(after.lines[2].phase).toBe('idle');
  });

  it('line-ended → STOP, PAS d auto-next (ARCEP : le cycle s arrête)', () => {
    let s = poolReducer(createPoolState(3, queue), { type: 'play' });
    s = poolReducer(s, { type: 'answered', slot: 0 });
    const after = poolReducer(s, { type: 'line-ended', slot: 0 });
    expect(after.lines[0].phase).toBe('ended');
    expect(after.running).toBe(false);
    // La file reste en attente : l'humain doit re-cliquer Play.
    expect(after.queue.length).toBe(2);
  });

  it('reset remet le pool à zéro avec une nouvelle file', () => {
    const s = poolReducer(createPoolState(3, queue), { type: 'play' });
    const after = poolReducer(s, { type: 'reset', queue: ['+33666666666'] });
    expect(after.lines.every((l) => l.phase === 'idle')).toBe(true);
    expect(after.queue).toEqual(['+33666666666']);
    expect(after.running).toBe(false);
  });
});
