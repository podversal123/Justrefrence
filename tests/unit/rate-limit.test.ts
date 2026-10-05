import { describe, expect, it } from "vitest";
import { loginRateLimiter } from "@/server/lib/rate-limit";

describe("rate limiter foundation", () => {
  it("allows requests under the limit", async () => {
    const key = `test-${crypto.randomUUID()}`;
    for (let i = 0; i < 10; i++) {
      const result = await loginRateLimiter.consume(key);
      expect(result.allowed).toBe(true);
    }
  });

  it("denies the request once the limit is exceeded", async () => {
    const key = `test-${crypto.randomUUID()}`;
    for (let i = 0; i < 10; i++) {
      await loginRateLimiter.consume(key);
    }
    const result = await loginRateLimiter.consume(key);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("tracks separate keys independently", async () => {
    const keyA = `test-a-${crypto.randomUUID()}`;
    const keyB = `test-b-${crypto.randomUUID()}`;

    for (let i = 0; i < 10; i++) {
      await loginRateLimiter.consume(keyA);
    }

    const resultA = await loginRateLimiter.consume(keyA);
    const resultB = await loginRateLimiter.consume(keyB);

    expect(resultA.allowed).toBe(false);
    expect(resultB.allowed).toBe(true);
  });
});
