/**
 * In-memory sliding-window rate limiter middleware.
 *
 * No external dependencies. Keyed by IP address. Suitable for
 * single-process deployments; for multi-process/horizontal scaling
 * replace with a Redis-backed implementation.
 */

import { Request, Response, NextFunction } from 'express';
import { createTypedError, apiError } from '../domain/errors';

interface RateLimitEntry {
  /** Timestamps of requests within the current window */
  timestamps: number[];
}

export interface RateLimitOptions {
  /** Maximum requests allowed within the window. Default: 60 */
  maxRequests?: number;
  /** Window duration in milliseconds. Default: 60_000 (1 minute) */
  windowMs?: number;
}

/**
 * Create a rate-limiting middleware.
 *
 * Returns 429 with a typed error when the limit is exceeded.
 * Includes standard rate-limit headers (RateLimit-Limit, RateLimit-Remaining, Retry-After).
 */
export function rateLimit(options?: RateLimitOptions) {
  const maxRequests = options?.maxRequests ?? 60;
  const windowMs = options?.windowMs ?? 60_000;
  const store = new Map<string, RateLimitEntry>();

  // Periodic cleanup of expired entries to prevent memory growth
  const cleanupInterval = setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [key, entry] of store) {
      entry.timestamps = entry.timestamps.filter(t => t > cutoff);
      if (entry.timestamps.length === 0) {
        store.delete(key);
      }
    }
  }, windowMs);

  // Allow garbage collection if the process holds no other refs
  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const now = Date.now();
    const cutoff = now - windowMs;

    let entry = store.get(key);
    if (!entry) {
      entry = { timestamps: [] };
      store.set(key, entry);
    }

    // Trim expired timestamps
    entry.timestamps = entry.timestamps.filter(t => t > cutoff);

    if (entry.timestamps.length >= maxRequests) {
      const oldestInWindow = entry.timestamps[0];
      const retryAfterMs = oldestInWindow + windowMs - now;
      const retryAfterSec = Math.ceil(retryAfterMs / 1000);

      res.set('RateLimit-Limit', String(maxRequests));
      res.set('RateLimit-Remaining', '0');
      res.set('Retry-After', String(retryAfterSec));

      res.status(429).json(
        apiError(
          createTypedError({
            code: 'RATE_LIMIT.EXCEEDED',
            message: `Rate limit exceeded. Try again in ${retryAfterSec} seconds.`,
            retryable: true,
            details: { retryAfterMs, limit: maxRequests, windowMs },
          }),
        ),
      );
      return;
    }

    entry.timestamps.push(now);

    res.set('RateLimit-Limit', String(maxRequests));
    res.set('RateLimit-Remaining', String(maxRequests - entry.timestamps.length));

    next();
  };
}
