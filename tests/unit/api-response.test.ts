import { describe, expect, it } from "vitest";
import { z } from "zod";
import { apiFailure, apiSuccess, toApiErrorResponse } from "@/lib/api-response";
import { AuthorizationError, ValidationError } from "@/server/lib/errors";

describe("api-response envelope", () => {
  it("builds a success envelope", () => {
    const result = apiSuccess({ id: "1" }, "req-1");
    expect(result).toEqual({
      success: true,
      data: { id: "1" },
      meta: { requestId: "req-1" },
    });
  });

  it("builds a failure envelope", () => {
    const result = apiFailure("NOT_FOUND", "Order could not be found", undefined, "req-2");
    expect(result.success).toBe(false);
    expect(result.error.code).toBe("NOT_FOUND");
    expect(result.meta.requestId).toBe("req-2");
  });

  it("maps a known AppError to its declared status and code", async () => {
    const response = toApiErrorResponse(new AuthorizationError());
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("maps a ValidationError to 422", async () => {
    const response = toApiErrorResponse(new ValidationError("Bad input"));
    expect(response.status).toBe(422);
  });

  it("maps a ZodError to 422 VALIDATION_ERROR with field details", async () => {
    const schema = z.object({ email: z.string().email() });
    const parsed = schema.safeParse({ email: "not-an-email" });
    expect(parsed.success).toBe(false);

    const response = toApiErrorResponse(parsed.success ? undefined : parsed.error);
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details).toBeDefined();
  });

  it("never leaks a raw error message for an unexpected error", async () => {
    const response = toApiErrorResponse(new Error("password=hunter2 leaked internal detail"));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(body.error.message).not.toContain("hunter2");
  });
});
