import { beforeEach, describe, expect, it, vi } from "vitest";

/** The expiry cron: closed to everyone without the secret, and runs both expiry jobs with it. */

const mockAuthorized = vi.fn();
vi.mock("@/server/lib/cron-auth", () => ({ isAuthorizedCronRequest: mockAuthorized }));

const mockExpireSubscriptions = vi.fn();
vi.mock("@/server/domain/subscription/subscription-service", () => ({
  expireSubscriptions: mockExpireSubscriptions,
}));
const mockExpireEpins = vi.fn();
vi.mock("@/server/domain/epin/epin-service", () => ({ expireFreshEpins: mockExpireEpins }));
vi.mock("@/server/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const { GET } = await import("@/app/api/cron/expire-stale/route");

beforeEach(() => {
  vi.clearAllMocks();
  mockAuthorized.mockReturnValue(true);
  mockExpireSubscriptions.mockResolvedValue(2);
  mockExpireEpins.mockResolvedValue(5);
});

describe("GET /api/cron/expire-stale", () => {
  it("refuses a request without the cron secret and changes nothing", async () => {
    mockAuthorized.mockReturnValue(false);
    const response = await GET(new Request("http://localhost/api/cron/expire-stale"));
    expect(response.status).toBe(401);
    expect(mockExpireSubscriptions).not.toHaveBeenCalled();
    expect(mockExpireEpins).not.toHaveBeenCalled();
  });

  it("expires subscriptions and e-pins and reports how many", async () => {
    const response = await GET(new Request("http://localhost/api/cron/expire-stale"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ subscriptions: 2, epins: 5 });
  });

  it("answers 500 without leaking the error when a job fails", async () => {
    mockExpireEpins.mockRejectedValue(new Error("db down: secret detail"));
    const response = await GET(new Request("http://localhost/api/cron/expire-stale"));
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("secret detail");
  });
});
