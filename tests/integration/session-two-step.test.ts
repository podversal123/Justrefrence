import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * How getAuthSession treats staff when the two-step requirement is on, with Supabase, the database and
 * the settings replaced by fakes. The point: a staff account that has not entered its code must come out
 * with NO permissions (so any page or action that forgot to ask is refused anyway), a staff account that
 * has must keep them, members are never held, and the lookup is skipped while the requirement is off.
 */

vi.mock("server-only", () => ({}));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache: <T>(fn: T) => fn,
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

const mockGetUser = vi.fn();
const mockGetAal = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mockGetUser, mfa: { getAuthenticatorAssuranceLevel: mockGetAal } },
  }),
}));

const mockFindUser = vi.fn();
vi.mock("@/server/lib/prisma", () => ({ prisma: { user: { findUnique: mockFindUser } } }));

const mockSettings = vi.fn();
vi.mock("@/server/lib/site-settings", () => ({ getSiteSettings: mockSettings }));

const { getAuthSession } = await import("@/server/auth/session");

function dbUser(role: string) {
  return {
    id: "u-1",
    email: "x@example.com",
    fullName: "X",
    status: "ACTIVE",
    userRoles: [
      {
        role: {
          code: role,
          rolePermissions: [{ permission: { code: "member:read:any" } }],
        },
      },
    ],
    vendorProfile: null,
    memberProfile: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: "u-1" } } });
});

describe("getAuthSession and two-step", () => {
  it("strips every permission from a staff session that has not entered its code", async () => {
    mockFindUser.mockResolvedValue(dbUser("ADMIN"));
    mockSettings.mockResolvedValue({ staffTwoStepRequired: true });
    mockGetAal.mockResolvedValue({ data: { currentLevel: "aal1" } });

    const session = await getAuthSession();

    expect(session?.twoStepPending).toBe(true);
    expect(session?.permissions.size).toBe(0);
    expect(session?.roles).toEqual(["ADMIN"]);
  });

  it("keeps the permissions once the code has been entered this session", async () => {
    mockFindUser.mockResolvedValue(dbUser("ADMIN"));
    mockSettings.mockResolvedValue({ staffTwoStepRequired: true });
    mockGetAal.mockResolvedValue({ data: { currentLevel: "aal2" } });

    const session = await getAuthSession();

    expect(session?.twoStepPending).toBe(false);
    expect(session?.permissions.has("member:read:any")).toBe(true);
  });

  it("holds the session when Supabase cannot say what level it is at", async () => {
    mockFindUser.mockResolvedValue(dbUser("SUPER_ADMIN"));
    mockSettings.mockResolvedValue({ staffTwoStepRequired: true });
    mockGetAal.mockResolvedValue({ data: null, error: new Error("down") });

    const session = await getAuthSession();

    expect(session?.twoStepPending).toBe(true);
    expect(session?.permissions.size).toBe(0);
  });

  it("never holds a member, and does not even ask for the level", async () => {
    mockFindUser.mockResolvedValue(dbUser("CUSTOMER"));
    mockSettings.mockResolvedValue({ staffTwoStepRequired: true });

    const session = await getAuthSession();

    expect(session?.twoStepPending).toBe(false);
    expect(session?.permissions.has("member:read:any")).toBe(true);
    expect(mockGetAal).not.toHaveBeenCalled();
  });

  it("holds nobody while the requirement is off, and does not ask for the level", async () => {
    mockFindUser.mockResolvedValue(dbUser("ADMIN"));
    mockSettings.mockResolvedValue({ staffTwoStepRequired: false });

    const session = await getAuthSession();

    expect(session?.twoStepPending).toBe(false);
    expect(session?.permissions.has("member:read:any")).toBe(true);
    expect(mockGetAal).not.toHaveBeenCalled();
  });
});
