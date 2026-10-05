import { describe, expect, it } from "vitest";
import { isUniqueConstraintViolation, scopedIdempotencyKey } from "@/server/lib/idempotency";

describe("scopedIdempotencyKey", () => {
  it("binds the client key to operation and user, so the same key never collides across users or operations", () => {
    const a = scopedIdempotencyKey("payout", "user-a", "key-1");
    expect(a).toBe("payout:user-a:key-1");
    expect(scopedIdempotencyKey("payout", "user-b", "key-1")).not.toBe(a);
    expect(scopedIdempotencyKey("checkout", "user-a", "key-1")).not.toBe(a);
  });
});

describe("isUniqueConstraintViolation", () => {
  it("recognises Prisma P2002 only", () => {
    expect(isUniqueConstraintViolation({ code: "P2002" })).toBe(true);
    expect(isUniqueConstraintViolation({ code: "P2025" })).toBe(false);
    expect(isUniqueConstraintViolation(new Error("x"))).toBe(false);
    expect(isUniqueConstraintViolation(null)).toBe(false);
  });
});
