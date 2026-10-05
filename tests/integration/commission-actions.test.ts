import { describe, expect, it, vi, beforeEach } from "vitest";
import { AuthorizationError } from "@/server/lib/errors";
import type { AuthSession } from "@/server/auth/session";
import type { Permission } from "@/server/auth/permissions";

/**
 * Integration-style tests for the admin commission-rule Server Action —
 * verifies the WIRING (permission gate, repository delegation, audit
 * write), same convention as tests/integration/vendor-actions.test.ts.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const mockAuthorize = vi.fn();
vi.mock("@/server/auth/authorize", () => ({ authorize: mockAuthorize }));

const mockRecordAudit = vi.fn();
vi.mock("@/server/domain/audit/record", () => ({ recordAudit: mockRecordAudit }));

const mockCreateRuleVersion = vi.fn();
vi.mock("@/server/repositories/commission/commission-rule-repository", () => ({
  createRuleVersion: mockCreateRuleVersion,
}));

const { createCommissionRuleAction } = await import("@/server/services/commission-actions");

function session(overrides: Partial<AuthSession> = {}): AuthSession {
  return {
    userId: "super-admin-1",
    email: "admin@example.com",
    fullName: "Admin",
    status: "ACTIVE",
    roles: ["SUPER_ADMIN"],
    permissions: new Set<Permission>(["commission_rule:update"]),
    hasVendorProfile: false,
    vendorProfileId: null,
    ...overrides,
  };
}

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

const VALID_PERCENT_RULE = {
  level: "1",
  appliesTo: "PRODUCT",
  rateBasis: "PERCENT_OF_ORDER",
  rateValuePercent: "5",
  qualifyingEvent: "ORDER_COMPLETED",
  releaseDelayDays: "7",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createCommissionRuleAction", () => {
  it("is denied when the caller lacks commission_rule:update", async () => {
    mockAuthorize.mockRejectedValue(new AuthorizationError());

    const result = await createCommissionRuleAction(undefined, formData(VALID_PERCENT_RULE));

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("FORBIDDEN");
    expect(mockCreateRuleVersion).not.toHaveBeenCalled();
  });

  it("rejects a PERCENT rule with no rateValuePercent", async () => {
    mockAuthorize.mockResolvedValue(session());

    const result = await createCommissionRuleAction(
      undefined,
      formData({ ...VALID_PERCENT_RULE, rateValuePercent: "" }),
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("VALIDATION_ERROR");
    expect(mockCreateRuleVersion).not.toHaveBeenCalled();
  });

  it("rejects a FIXED rule with no rateValueFixed", async () => {
    mockAuthorize.mockResolvedValue(session());

    const result = await createCommissionRuleAction(
      undefined,
      formData({ ...VALID_PERCENT_RULE, rateBasis: "FIXED", rateValuePercent: "" }),
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("VALIDATION_ERROR");
  });

  it("converts the percent input to basis points before persisting", async () => {
    mockAuthorize.mockResolvedValue(session());
    mockCreateRuleVersion.mockResolvedValue({
      id: "rule-1",
      level: 1,
      appliesTo: "PRODUCT",
      rateBasis: "PERCENT_OF_ORDER",
      rateValueBps: 500,
      rateValueFixed: null,
      releaseDelayDays: 7,
    });

    const result = await createCommissionRuleAction(undefined, formData(VALID_PERCENT_RULE));

    expect(result.success).toBe(true);
    expect(mockCreateRuleVersion).toHaveBeenCalledWith(
      expect.objectContaining({ rateValueBps: 500, createdBy: "super-admin-1" }),
    );
    expect(mockRecordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "COMMISSION_RULE_VERSION_CREATED", entityId: "rule-1" }),
    );
  });

  it("passes a FIXED amount through as bigint paise", async () => {
    mockAuthorize.mockResolvedValue(session());
    mockCreateRuleVersion.mockResolvedValue({
      id: "rule-2",
      level: 1,
      appliesTo: "SERVICE",
      rateBasis: "FIXED",
      rateValueBps: null,
      rateValueFixed: 2500n,
      releaseDelayDays: 7,
    });

    const result = await createCommissionRuleAction(
      undefined,
      formData({ ...VALID_PERCENT_RULE, rateBasis: "FIXED", rateValuePercent: "", rateValueFixed: "2500" }),
    );

    expect(result.success).toBe(true);
    expect(mockCreateRuleVersion).toHaveBeenCalledWith(
      expect.objectContaining({ rateValueFixed: 2500n, rateValueBps: null }),
    );
  });
});
