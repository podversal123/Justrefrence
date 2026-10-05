import { describe, expect, it, vi, beforeEach } from "vitest";
import { AuthorizationError } from "@/server/lib/errors";
import type { AuthSession } from "@/server/auth/session";
import type { Permission } from "@/server/auth/permissions";

/**
 * Integration-style tests for the order Server Action layer — verifies the
 * WIRING (session resolution, service-layer delegation, error mapping),
 * same convention as tests/integration/vendor-actions.test.ts. The
 * authorization DECISION itself (who may view/transition which order) is
 * covered directly in tests/integration/order-access.test.ts.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const mockGetAuthSession = vi.fn();
vi.mock("@/server/auth/session", () => ({ getAuthSession: mockGetAuthSession }));

const mockAuthorize = vi.fn();
vi.mock("@/server/auth/authorize", () => ({ authorize: mockAuthorize }));

const mockPlaceOrder = vi.fn();
vi.mock("@/server/domain/commerce/checkout-service", () => ({ placeOrder: mockPlaceOrder }));

const mockTransitionOrderStatus = vi.fn();
const mockCanViewOrder = vi.fn();
vi.mock("@/server/domain/commerce/order-service", () => ({
  transitionOrderStatus: mockTransitionOrderStatus,
  canViewOrder: mockCanViewOrder,
}));

const mockGetOrderDetail = vi.fn();
vi.mock("@/server/repositories/commerce/order-repository", () => ({
  getOrderDetail: mockGetOrderDetail,
}));

const mockGetMemberProfileByUserId = vi.fn();
vi.mock("@/server/repositories/identity/member-repository", () => ({
  getMemberProfileByUserId: mockGetMemberProfileByUserId,
}));

const mockEnsureInvoicePdf = vi.fn();
vi.mock("@/server/domain/commerce/invoice-service", () => ({
  ensureInvoicePdf: mockEnsureInvoicePdf,
}));

const mockGetInvoiceSignedUrl = vi.fn();
vi.mock("@/server/lib/invoice-storage", () => ({ getInvoiceSignedUrl: mockGetInvoiceSignedUrl }));

const { updateOrderStatusAction, getInvoiceDownloadUrlAction, placeOrderAction } =
  await import("@/server/services/order-actions");

function session(overrides: Partial<AuthSession> = {}): AuthSession {
  return {
    userId: "buyer-1",
    email: "buyer@example.com",
    fullName: "Buyer",
    status: "ACTIVE",
    roles: ["CUSTOMER"],
    permissions: new Set<Permission>(["order:create", "order:cancel"]),
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("placeOrderAction", () => {
  it("is denied when the caller lacks order:create", async () => {
    mockAuthorize.mockRejectedValue(new AuthorizationError());

    const result = await placeOrderAction(
      undefined,
      formData({ idempotencyKey: crypto.randomUUID() }),
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("FORBIDDEN");
    expect(mockPlaceOrder).not.toHaveBeenCalled();
  });

  it("is denied for an authenticated account with no member profile", async () => {
    mockAuthorize.mockResolvedValue(session());
    mockGetMemberProfileByUserId.mockResolvedValue(null);

    const result = await placeOrderAction(
      undefined,
      formData({ idempotencyKey: crypto.randomUUID() }),
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("FORBIDDEN");
    expect(mockPlaceOrder).not.toHaveBeenCalled();
  });
});

describe("updateOrderStatusAction — unauthorized order access", () => {
  it("requires an authenticated session", async () => {
    mockGetAuthSession.mockResolvedValue(null);

    const result = await updateOrderStatusAction(
      undefined,
      formData({ orderId: "11111111-1111-4111-8111-111111111111", status: "PAID" }),
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("UNAUTHENTICATED");
    expect(mockTransitionOrderStatus).not.toHaveBeenCalled();
  });

  it("surfaces the service layer's AuthorizationError for a caller unrelated to the order", async () => {
    mockGetAuthSession.mockResolvedValue(session());
    mockTransitionOrderStatus.mockRejectedValue(
      new AuthorizationError("You don't have access to this order."),
    );

    const result = await updateOrderStatusAction(
      undefined,
      formData({ orderId: "11111111-1111-4111-8111-111111111111", status: "PROCESSING" }),
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("FORBIDDEN");
  });

  it("requires a reason when cancelling", async () => {
    mockGetAuthSession.mockResolvedValue(session());

    const result = await updateOrderStatusAction(
      undefined,
      formData({ orderId: "11111111-1111-4111-8111-111111111111", status: "CANCELLED" }),
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("VALIDATION_ERROR");
    expect(mockTransitionOrderStatus).not.toHaveBeenCalled();
  });
});

describe("getInvoiceDownloadUrlAction — unauthorized order access", () => {
  it("requires an authenticated session", async () => {
    mockGetAuthSession.mockResolvedValue(null);

    const result = await getInvoiceDownloadUrlAction("order-1");

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("UNAUTHENTICATED");
  });

  it("404s when the order doesn't exist", async () => {
    mockGetAuthSession.mockResolvedValue(session());
    mockGetOrderDetail.mockResolvedValue(null);

    const result = await getInvoiceDownloadUrlAction("ghost-order");

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("NOT_FOUND");
  });

  it("denies a customer who isn't this order's buyer", async () => {
    mockGetAuthSession.mockResolvedValue(session({ userId: "someone-else" }));
    mockGetOrderDetail.mockResolvedValue({
      id: "order-1",
      buyerId: "buyer-1",
      vendorId: "vendor-1",
    });
    mockCanViewOrder.mockReturnValue(false);

    const result = await getInvoiceDownloadUrlAction("order-1");

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("FORBIDDEN");
    expect(mockGetInvoiceSignedUrl).not.toHaveBeenCalled();
    // Authorization comes first: an unauthorized caller must never trigger PDF generation.
    expect(mockEnsureInvoicePdf).not.toHaveBeenCalled();
  });

  it("returns a signed URL for the order's own buyer", async () => {
    mockGetAuthSession.mockResolvedValue(session({ userId: "buyer-1" }));
    mockGetOrderDetail.mockResolvedValue({
      id: "order-1",
      buyerId: "buyer-1",
      vendorId: "vendor-1",
    });
    mockCanViewOrder.mockReturnValue(true);
    mockEnsureInvoicePdf.mockResolvedValue("order-1/inv.pdf");
    mockGetInvoiceSignedUrl.mockResolvedValue("https://signed.example/inv.pdf");

    const result = await getInvoiceDownloadUrlAction("order-1");

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.url).toBe("https://signed.example/inv.pdf");
  });
});
