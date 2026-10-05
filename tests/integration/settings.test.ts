import { describe, expect, it, vi, beforeEach } from "vitest";
import { AuthorizationError } from "@/server/lib/errors";
import { siteSettingsSchema } from "@/lib/schemas/settings";

/**
 * Site settings: validation, the maintenance bypass rule, and the Server
 * Action's wiring (permission, audit, immediate cache eviction).
 */

vi.mock("server-only", () => ({}));
const mockRevalidateTag = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: mockRevalidateTag,
  unstable_cache: (fn: unknown) => fn,
}));

const mockRecordAudit = vi.fn();
vi.mock("@/server/domain/audit/record", () => ({ recordAudit: mockRecordAudit }));

const mockAuthorize = vi.fn();
vi.mock("@/server/auth/authorize", () => ({ authorize: mockAuthorize }));

const prismaMock = {
  systemSetting: { findMany: vi.fn(), upsert: vi.fn((args: unknown) => args) },
  $transaction: vi.fn(async (ops: unknown[]) => ops),
};
vi.mock("@/server/lib/prisma", () => ({ prisma: prismaMock }));

const { canBypassMaintenance, getSiteSettings } = await import("@/server/lib/site-settings");
const { updateSiteSettingsAction } = await import("@/server/services/settings-actions");

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.systemSetting.findMany.mockResolvedValue([]);
  prismaMock.$transaction.mockImplementation(async (ops: unknown[]) => ops);
});

describe("siteSettingsSchema", () => {
  it("treats the checkbox as on only when it submits 'on'", () => {
    expect(siteSettingsSchema.parse({ maintenanceEnabled: "on" }).maintenanceEnabled).toBe(true);
    expect(siteSettingsSchema.parse({}).maintenanceEnabled).toBe(false);
    expect(siteSettingsSchema.parse({ maintenanceEnabled: "off" }).maintenanceEnabled).toBe(false);
  });

  it("allows empty contact fields but rejects a malformed email or phone", () => {
    expect(siteSettingsSchema.safeParse({ contactEmail: "", contactPhone: "" }).success).toBe(true);
    expect(siteSettingsSchema.safeParse({ contactEmail: "not-an-email" }).success).toBe(false);
    expect(siteSettingsSchema.safeParse({ contactPhone: "call me maybe" }).success).toBe(false);
    expect(siteSettingsSchema.safeParse({ contactPhone: "+91 98765 43210" }).success).toBe(true);
  });
});

describe("canBypassMaintenance", () => {
  it("lets every staff role through and nobody else", () => {
    for (const role of ["SUPER_ADMIN", "ADMIN", "FINANCE", "SUPPORT"]) {
      expect(canBypassMaintenance({ roles: [role] })).toBe(true);
    }
    expect(canBypassMaintenance({ roles: ["CUSTOMER"] })).toBe(false);
    expect(canBypassMaintenance({ roles: ["VENDOR", "CUSTOMER"] })).toBe(false);
    expect(canBypassMaintenance({ roles: [] })).toBe(false);
    expect(canBypassMaintenance(null)).toBe(false);
  });
});

describe("getSiteSettings", () => {
  it("fails open: a database error never locks the site (maintenance stays off)", async () => {
    prismaMock.systemSetting.findMany.mockRejectedValue(new Error("db down"));
    const settings = await getSiteSettings();
    expect(settings.maintenanceEnabled).toBe(false);
  });

  it("reads stored values by key", async () => {
    prismaMock.systemSetting.findMany.mockResolvedValue([
      { key: "site.maintenance_enabled", valueJson: true },
      { key: "site.contact_email", valueJson: "hello@example.com" },
    ]);
    const settings = await getSiteSettings();
    expect(settings.maintenanceEnabled).toBe(true);
    expect(settings.contactEmail).toBe("hello@example.com");
    expect(settings.contactPhone).toBe("");
  });
});

describe("updateSiteSettingsAction", () => {
  it("is denied without settings:update and saves nothing", async () => {
    mockAuthorize.mockRejectedValue(new AuthorizationError("no"));
    const result = await updateSiteSettingsAction(
      undefined,
      formData({ maintenanceEnabled: "on" }),
    );
    expect(result.success).toBe(false);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(mockRevalidateTag).not.toHaveBeenCalled();
  });

  it("rejects invalid input before touching the database", async () => {
    mockAuthorize.mockResolvedValue({ userId: "admin-1" });
    const result = await updateSiteSettingsAction(undefined, formData({ contactEmail: "nope" }));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("VALIDATION_ERROR");
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("turning maintenance on is audited as such and evicts the cache immediately", async () => {
    mockAuthorize.mockResolvedValue({ userId: "admin-1" });

    const result = await updateSiteSettingsAction(
      undefined,
      formData({ maintenanceEnabled: "on", maintenanceMessage: "Back at 6 pm" }),
    );

    expect(result.success).toBe(true);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(mockRecordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "MAINTENANCE_MODE_ENABLED", actorId: "admin-1" }),
    );
    // expire: 0 => the next request sees the change (no stale-while-revalidate window).
    expect(mockRevalidateTag).toHaveBeenCalledWith("site-settings", { expire: 0 });
  });

  it("a contact-only change is audited as a plain settings update", async () => {
    mockAuthorize.mockResolvedValue({ userId: "admin-1" });
    const result = await updateSiteSettingsAction(
      undefined,
      formData({ contactEmail: "hello@example.com" }),
    );
    expect(result.success).toBe(true);
    expect(mockRecordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "SITE_SETTINGS_UPDATED" }),
    );
  });
});
