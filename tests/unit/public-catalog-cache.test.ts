import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockList, mockListCategories } = vi.hoisted(() => ({
  mockList: vi.fn(),
  mockListCategories: vi.fn(),
}));

// The real cache stores JSON, so run the wrapped function and round-trip its result the same way.
vi.mock("next/cache", () => ({
  unstable_cache:
    <A extends unknown[], R>(fn: (...args: A) => Promise<R>) =>
    async (...args: A) =>
      JSON.parse(JSON.stringify(await fn(...args))) as R,
}));
vi.mock("server-only", () => ({}));
vi.mock("@/server/repositories/catalog/registry", () => ({
  getCatalogRepository: () => ({ list: mockList, listCategories: mockListCategories }),
}));

import {
  listPublicCatalog,
  listPublicCategories,
} from "@/server/repositories/catalog/public-cache";

describe("public catalog cache", () => {
  beforeEach(() => vi.clearAllMocks());

  it("asks only for public listings and gives dates back as Date objects", async () => {
    const createdAt = new Date("2026-10-01T10:00:00.000Z");
    mockList.mockResolvedValue({
      items: [{ id: "p1", title: "Paper", createdAt }],
      nextCursor: "p1",
    });

    const query = { sortBy: "createdAt", sortDir: "desc", limit: 12 } as const;
    const result = await listPublicCatalog("PRODUCT", query);

    expect(mockList).toHaveBeenCalledWith(query, { publicOnly: true });
    expect(result.nextCursor).toBe("p1");
    expect(result.items[0]?.createdAt).toBeInstanceOf(Date);
    expect(result.items[0]?.createdAt.toISOString()).toBe(createdAt.toISOString());
  });

  it("returns the category list", async () => {
    mockListCategories.mockResolvedValue([{ id: "c1", name: "Paper", subcategories: [] }]);
    expect(await listPublicCategories("PRODUCT")).toEqual([
      { id: "c1", name: "Paper", subcategories: [] },
    ]);
  });
});
