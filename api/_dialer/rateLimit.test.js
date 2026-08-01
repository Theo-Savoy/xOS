import { describe, expect, it } from 'vitest';
import { TokenBucket, RateLimiter } from './rateLimit.js';

describe('TokenBucket', () => {
  it('starts full and consumes up to capacity', () => {
    const bucket = new TokenBucket({ capacity: 5, refillPerSecond: 1 });
    // Pin time to avoid refill races between consume calls.
    const t0 = Date.now();
    for (let i = 0; i < 5; i++) {
      expect(bucket.tryConsume(1, t0)).toEqual({ allowed: true, retryAfterMs: 0 });
    }
    // 6th call at the same instant: rejected.
    const r = bucket.tryConsume(1, t0);
    expect(r.allowed).toBe(false);
    expect(r.retryAfterMs).toBeGreaterThan(0);
    expect(r.retryAfterMs).toBeLessThanOrEqual(1000);
  });

  it('refills tokens over time', () => {
    const bucket = new TokenBucket({ capacity: 2, refillPerSecond: 2 });
    const t0 = Date.now();
    bucket.tryConsume(1, t0);
    bucket.tryConsume(1, t0);
    expect(bucket.tryConsume(1, t0).allowed).toBe(false);

    // Advance clock by 1 second — bucket fully refills
    const result = bucket.tryConsume(1, t0 + 1000);
    expect(result.allowed).toBe(true);
  });

  it('caps at capacity when idle', () => {
    const bucket = new TokenBucket({ capacity: 3, refillPerSecond: 1 });
    const t0 = Date.now();
    // After 10s idle, capacity caps at 3. Ask for 5.
    const result = bucket.tryConsume(5, t0 + 10_000);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThanOrEqual(1000);
    expect(result.retryAfterMs).toBeLessThanOrEqual(2100);
  });

  it('rejects negative or zero capacity', () => {
    expect(() => new TokenBucket({ capacity: 0, refillPerSecond: 1 })).toThrow();
    expect(() => new TokenBucket({ capacity: -1, refillPerSecond: 1 })).toThrow();
  });

  it('returns retry-after proportional to deficit', () => {
    const bucket = new TokenBucket({ capacity: 10, refillPerSecond: 5 });
    bucket.tryConsume(10); // empty
    const r = bucket.tryConsume(3); // need 3 tokens at 5/s = 600ms
    expect(r.allowed).toBe(false);
    expect(r.retryAfterMs).toBeGreaterThanOrEqual(500);
    expect(r.retryAfterMs).toBeLessThanOrEqual(700);
  });
});

describe('RateLimiter', () => {
  it('creates a bucket per key on first use', () => {
    const limiter = new RateLimiter({ capacity: 5, refillPerSecond: 1 });
    limiter.tryConsume('caller-A');
    limiter.tryConsume('caller-B');
    const snap = limiter.snapshot();
    expect(Object.keys(snap)).toEqual(['caller-A', 'caller-B']);
  });

  it('isolates buckets per key', () => {
    const limiter = new RateLimiter({ capacity: 1, refillPerSecond: 0.001 });
    expect(limiter.tryConsume('A').allowed).toBe(true);
    expect(limiter.tryConsume('A').allowed).toBe(false);
    // B is independent
    expect(limiter.tryConsume('B').allowed).toBe(true);
  });

  it('reset() clears all buckets', () => {
    const limiter = new RateLimiter({ capacity: 1, refillPerSecond: 0.001 });
    limiter.tryConsume('A');
    limiter.reset();
    expect(limiter.snapshot()).toEqual({});
  });
});