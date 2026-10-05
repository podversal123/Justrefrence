/**
 * Rate limiting foundation — see docs/security.md §9.
 *
 * The interface is what call sites depend on. Two implementations:
 * - `UpstashRateLimiter`: Redis-backed (via `RATE_LIMIT_REDIS_URL` +
 *   `RATE_LIMIT_REDIS_TOKEN`), shares state across every serverless
 *   instance — this is the real production limiter.
 * - `InMemoryRateLimiter`: per-instance fallback, used automatically when
 *   the Redis env vars aren't set (local dev without a provisioned Upstash
 *   store). It does NOT share state across instances — see the security
 *   audit this session, this was the exact gap flagged there. Never rely on
 *   it in production; `createRateLimiter()` below only falls back to it
 *   when Redis config is genuinely absent, and logs a warning when it does.
 */
import { Redis } from "@upstash/redis";
import { logger } from "@/server/lib/logger";

export interface RateLimiter {
  /** Returns true if the request should be ALLOWED. */
  consume(key: string): Promise<{ allowed: boolean; remaining: number; resetAt: number }>;
}

interface Bucket {
  count: number;
  windowStart: number;
}

class InMemoryRateLimiter implements RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  async consume(key: string) {
    const now = Date.now();
    const existing = this.buckets.get(key);

    if (!existing || now - existing.windowStart >= this.windowMs) {
      this.buckets.set(key, { count: 1, windowStart: now });
      return { allowed: true, remaining: this.limit - 1, resetAt: now + this.windowMs };
    }

    if (existing.count >= this.limit) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: existing.windowStart + this.windowMs,
      };
    }

    existing.count += 1;
    return {
      allowed: true,
      remaining: this.limit - existing.count,
      resetAt: existing.windowStart + this.windowMs,
    };
  }
}

/**
 * Redis-backed sliding-window-ish fixed-window limiter using a single
 * atomic INCR + conditional EXPIRE, so concurrent requests from the same
 * key across different serverless instances can't race past the limit —
 * the counter lives in Redis, not in any one instance's memory.
 */
class UpstashRateLimiter implements RateLimiter {
  constructor(
    private readonly redis: Redis,
    private readonly limit: number,
    private readonly windowSeconds: number,
    private readonly namespace: string,
  ) {}

  async consume(key: string) {
    const redisKey = `ratelimit:${this.namespace}:${key}`;
    const count = await this.redis.incr(redisKey);
    if (count === 1) {
      // Only the request that just created the counter sets its expiry —
      // avoids a race where a late EXPIRE from a concurrent request
      // resets an already-aging window back to full length.
      await this.redis.expire(redisKey, this.windowSeconds);
    }
    const ttl = await this.redis.ttl(redisKey);
    const resetAt = Date.now() + Math.max(ttl, 0) * 1000;

    if (count > this.limit) {
      return { allowed: false, remaining: 0, resetAt };
    }
    return { allowed: true, remaining: Math.max(this.limit - count, 0), resetAt };
  }
}

function createRateLimiter(namespace: string, limit: number, windowMs: number): RateLimiter {
  const url = process.env["RATE_LIMIT_REDIS_URL"];
  const token = process.env["RATE_LIMIT_REDIS_TOKEN"];

  // A placeholder such as "REPLACE_ME" (as shipped in .env.example) is
  // truthy but not a usable endpoint — constructing the client with it
  // throws at import time and would take down every page that imports a
  // limiter. Only a real https URL counts as "configured".
  if (url?.startsWith("https://") && token && token !== "REPLACE_ME") {
    const redis = new Redis({ url, token });
    return new UpstashRateLimiter(redis, limit, Math.ceil(windowMs / 1000), namespace);
  }

  if (process.env.NODE_ENV === "production") {
    // Fail loudly in production rather than silently running with a
    // limiter that doesn't share state across serverless instances.
    logger.error("rate_limiter_redis_not_configured_in_production", { namespace });
  }
  logger.warn("rate_limiter_using_in_memory_fallback", {
    namespace,
    reason:
      "RATE_LIMIT_REDIS_URL/RATE_LIMIT_REDIS_TOKEN missing or placeholder — per-instance limiting only, not safe for production.",
  });
  return new InMemoryRateLimiter(limit, windowMs);
}

/** Login attempts: 10 per 15 minutes per key (e.g. `login:{email}` or `login:ip:{ip}`). */
export const loginRateLimiter: RateLimiter = createRateLimiter("login", 10, 15 * 60 * 1000);

/** Password reset requests: 5 per hour per key. */
export const passwordResetRateLimiter: RateLimiter = createRateLimiter(
  "pwreset",
  5,
  60 * 60 * 1000,
);

/** Generic public API rate limit: 60 requests per minute per key. */
export const defaultRateLimiter: RateLimiter = createRateLimiter("default", 60, 60 * 1000);

/** OTP requests (registration or mobile login): 5 per 10 minutes per destination. */
export const otpRequestRateLimiter: RateLimiter = createRateLimiter("otp", 5, 10 * 60 * 1000);

/** Registration attempts: 10 per hour per email/IP key — a coarser guard above the OTP limiter. */
export const registrationRateLimiter: RateLimiter = createRateLimiter(
  "register",
  10,
  60 * 60 * 1000,
);

/** Payment-order creation: 20 per 10 minutes per user — see security audit finding (no throttle existed on this path at all). */
export const paymentOrderRateLimiter: RateLimiter = createRateLimiter(
  "payment-order",
  20,
  10 * 60 * 1000,
);

/** Support tickets, replies and internal messages: 30 per hour per user — stops a compromised/abusive account flooding staff inboxes. */
export const contentRateLimiter: RateLimiter = createRateLimiter("content", 30, 60 * 60 * 1000);

/** Public feedback form (anonymous): 5 per hour per IP. */
export const feedbackRateLimiter: RateLimiter = createRateLimiter("feedback", 5, 60 * 60 * 1000);

/** Public search typeahead (anonymous, fires while typing): 120 per minute per IP. */
export const searchRateLimiter: RateLimiter = createRateLimiter("search", 120, 60 * 1000);

/** Bids and requirements: 120 per 10 minutes per user — fast enough for a live auction, tight enough to stop scripted flooding. */
export const bidRateLimiter: RateLimiter = createRateLimiter("bid", 120, 10 * 60 * 1000);
