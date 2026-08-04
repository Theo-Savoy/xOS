// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createPoolState } from '../domain/PoolState';
import { poolReducer } from './poolLogic';

describe('poolLogic — power dialing (lot 11.5)', () => {
  const queue = ['+331****1111', '+332****2222', '+333****3333', '+334****4444', '+335****5555'];

  it('Play compose min(size, restants) depuis la file', () => {
    const s = createPoolState(3, queue);
    const after = poolReducer(s, { type: 'play' });
    expect(after.running).toBe(true);
    expect(after.lines.map((l) => l.destination)).toEqual([
      '+331****1111',
      '+332****2222',
      '+333****3333',
    ]);
    expect(after.lines.every((l) => l.phase === 'dialing')).toBe(true);
    // La file avance : les 2 suivants restent.
    expect(after.queue).toEqual(['+334****4444', '+335****5555']);
  });

  it('Play ne relance pas si un cycle est déjà actif', () => {
    const s = poolReducer(createPoolState(3, queue), { type: 'play' });
    const again = poolReducer(s, { type: 'play' });
    expect(again).toBe(s);
  });

  it('Skip abandonne la ligne et compose le suivant de la file', () => {
    const s = poolReducer(createPoolState(3, queue), { type: 'play' });
    const after = poolReducer(s, { type: 'skip', slot: 1 });
    expect(after.lines[1].destination).toBe('+334****4444');
    expect(after.lines[1].phase).toBe('dialing');
    expect(after.queue).toEqual(['+335****5555']);
  });

  it('Skip sur la dernière file → ligne skipped', () => {
    let s = poolReducer(createPoolState(2, ['+331****1111']), { type: 'play' });
    s = poolReducer(s, { type: 'skip', slot: 0 });
    expect(s.lines[0].phase).toBe('skipped');
    expect(s.queue).toEqual([]);
  });

  it('onAnswered garde la ligne, coupe les autres (hangup)', () => {
    const s = poolReducer(createPoolState(3, queue), { type: 'play' });
    const after = poolReducer(s, { type: 'answered', slot: 2 });
    expect(after.lines[2].phase).toBe('connected');
    // Les autres lignes en cours sont coupées.
    expect(after.lines[0].phase).toBe('skipped');
    expect(after.lines[1].phase).toBe('skipped');
  });

  it('onAnswered ne touche pas aux lignes idle (slot non composé)', () => {
    const s = poolReducer(createPoolState(3, ['+331****1111']), { type: 'play' });
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

  it('re-play : relance les SKIPPED (tentés-abandonnés), remplace les ENDED (connectés)', () => {
    // Cycle complet : play → answered slot 0 → line-ended → re-play.
    let s = poolReducer(createPoolState(3, queue), { type: 'play' });
    s = poolReducer(s, { type: 'answered', slot: 0 }); // 0 connecté, 1-2 skipped
    s = poolReducer(s, { type: 'line-ended', slot: 0 }); // 0 ended, STOP
    // État : lignes = [ended(1), skipped(2), skipped(3)], queue = [4, 5]
    const after = poolReducer(s, { type: 'play' });

    // La ligne connectée (slot 0) SORT : remplacée par le prochain (4).
    expect(after.lines[0].destination).toBe('+334****4444');
    // Les lignes tentées-puis-abandonnées (skipped) sont RELANCÉES (2, 3).
    expect(after.lines[1].destination).toBe('+332****2222');
    expect(after.lines[1].phase).toBe('dialing');
    expect(after.lines[2].destination).toBe('+333****3333');
    expect(after.lines[2].phase).toBe('dialing');
    // La file a consommé 4, il reste 5.
    expect(after.queue).toEqual(['+335****5555']);
    expect(after.running).toBe(true);
  });

  it('re-play avec file vide : relance quand même les skipped', () => {
    let s = poolReducer(createPoolState(3, ['+331****1111', '+332****2222']), { type: 'play' });
    s = poolReducer(s, { type: 'answered', slot: 0 });
    s = poolReducer(s, { type: 'line-ended', slot: 0 });
    // État : lignes = [ended(1), skipped(2)], queue = []
    const after = poolReducer(s, { type: 'play' });
    expect(after.lines[1].destination).toBe('+332****2222');
    expect(after.lines[1].phase).toBe('dialing');
    expect(after.lines[0].phase).toBe('idle'); // rien à composer
    expect(after.running).toBe(true);
  });

  it('reset remet le pool à zéro avec une nouvelle file', () => {
    const s = poolReducer(createPoolState(3, queue), { type: 'play' });
    const after = poolReducer(s, { type: 'reset', queue: ['+336****6666'] });
    expect(after.lines.every((l) => l.phase === 'idle')).toBe(true);
    expect(after.queue).toEqual(['+336****6666']);
    expect(after.running).toBe(false);
  });
});
