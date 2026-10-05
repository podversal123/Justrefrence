import { describe, expect, it } from "vitest";
import { forgotPasswordSchema, loginSchema, resetPasswordSchema } from "@/lib/schemas/auth";

describe("auth schemas", () => {
  it("accepts a valid login payload", () => {
    const result = loginSchema.safeParse({ email: "user@example.com", password: "hunter2pass" });
    expect(result.success).toBe(true);
  });

  it("normalizes email casing", () => {
    const result = loginSchema.parse({ email: "USER@Example.com", password: "x" });
    expect(result.email).toBe("user@example.com");
  });

  it("rejects an invalid email", () => {
    const result = loginSchema.safeParse({ email: "not-an-email", password: "x" });
    expect(result.success).toBe(false);
  });

  it("rejects an empty password", () => {
    const result = loginSchema.safeParse({ email: "user@example.com", password: "" });
    expect(result.success).toBe(false);
  });

  it("validates forgot-password email", () => {
    expect(forgotPasswordSchema.safeParse({ email: "user@example.com" }).success).toBe(true);
    expect(forgotPasswordSchema.safeParse({ email: "nope" }).success).toBe(false);
  });

  it("enforces password strength rules on reset", () => {
    const weak = resetPasswordSchema.safeParse({
      password: "short",
      confirmPassword: "short",
    });
    expect(weak.success).toBe(false);

    const strong = resetPasswordSchema.safeParse({
      password: "Str0ngPassword",
      confirmPassword: "Str0ngPassword",
    });
    expect(strong.success).toBe(true);
  });

  it("rejects mismatched password confirmation", () => {
    const result = resetPasswordSchema.safeParse({
      password: "Str0ngPassword",
      confirmPassword: "Different123",
    });
    expect(result.success).toBe(false);
  });
});
