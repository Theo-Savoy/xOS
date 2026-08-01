/**
 * api/_dialer/rateLimit.js — Token bucket rate limiter.
 *
 * Spec: docs/specs/lot-11.1-telnyx-infra.md §2.3.
 *
 * Telnyx API limit: 100 req/s. We aim 5 req/s sustained, burst 20.
 * One bucket per Telnyx resource (caller_id, recording, etc.).
 * Rejection returns { allowed: false, retryAfterMs }.
 */

export class TokenBucket {
  constructor({ capacity, refillPerSecond }) {
    if (!Number.isFinite(capacity) || capacity <= 0) {
      throw new Error('capacity must be a positive number');
    }
    if (!Number.isFinite(refillPerSecond) || refillPerSecond <= 0) {
      throw new Error('refillPerSecond must be a positive number');
    }
    this.capacity = capacity;
    this.refillPerSecond = refillPerSecond;
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  /** Returns { allowed, retryAfterMs }. */
  tryConsume(tokens = 1, now = Date.now()) {
    // Refill tokens since last call.
    const elapsedMs = now - this.lastRefill;
    if (elapsedMs > 0) {
      const refill = (elapsedMs / 1000) * this.refillPerSecond;
      this.tokens = Math.min(this.capacity, this.tokens + refill);
      this.lastRefill = now;
    }

    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return { allowed: true, retryAfterMs: 0 };
    }

    const deficit = tokens - this.tokens;
    const retryAfterMs = Math.ceil((deficit / this.refillPerSecond) * 1000);
    return { allowed: false, retryAfterMs };
  }
}

/**
 * Per-caller-id bucket registry. Lazily creates a bucket on first use.
 */
export class RateLimiter {
  constructor({ capacity, refillPerSecond }) {
    this.factory = () =>
      new TokenBucket({ capacity, refillPerSecond });
    this.buckets = new Map();
  }

  tryConsume(key = 'default', tokens = 1) {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = this.factory();
      this.buckets.set(key, bucket);
    }
    return bucket.tryConsume(tokens);
  }

  /** Test helper: snapshot of all bucket states. */
  snapshot() {
    const out = {};
    for (const [k, v] of this.buckets) {
      out[k] = { tokens: v.tokens, capacity: v.capacity };
    }
    return out;
  }

  /** Test helper: reset all buckets. */
  reset() {
    this.buckets.clear();
  }
}