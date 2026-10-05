import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/server/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/server/repositories/catalog/registry", () => ({ getCatalogRepository: vi.fn() }));

const { normalizeQuery, rankByTitle, MIN_QUERY_LENGTH, MAX_QUERY_LENGTH } =
  await import("@/server/domain/search/marketplace-search");

describe("normalizeQuery", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeQuery("  office   chair ")).toBe("office chair");
  });
  it("returns null when too short, empty or missing", () => {
    expect(normalizeQuery("a")).toBeNull();
    expect(normalizeQuery("   ")).toBeNull();
    expect(normalizeQuery(undefined)).toBeNull();
    expect(normalizeQuery(null)).toBeNull();
    expect(normalizeQuery("a".repeat(MIN_QUERY_LENGTH))).toBe("aa");
  });
  it("caps the length so a huge query can't reach the database", () => {
    expect(normalizeQuery("x".repeat(500))?.length).toBe(MAX_QUERY_LENGTH);
  });
});

describe("rankByTitle", () => {
  const titles = [
    "Digital Infrared Thermometer",
    "Pulse Oximeter, Fingertip",
    "Laser Toner Cartridge, Black",
    "Cartridge Holder",
    "Ink Cartridge",
  ].map((title) => ({ title }));

  it("puts titles that START with the query first, then word-start, then contains", () => {
    const ranked = rankByTitle(titles, "cart").map((t) => t.title);
    expect(ranked[0]).toBe("Cartridge Holder"); // starts with
    expect(ranked.slice(1, 3)).toEqual(["Laser Toner Cartridge, Black", "Ink Cartridge"]); // a word starts with it
  });

  it("is case-insensitive and keeps the original order within a rank (stable)", () => {
    const ranked = rankByTitle(titles, "CARTRIDGE").map((t) => t.title);
    expect(ranked.indexOf("Cartridge Holder")).toBe(0);
    expect(ranked.indexOf("Laser Toner Cartridge, Black")).toBeLessThan(
      ranked.indexOf("Ink Cartridge"),
    );
  });

  it("leaves non-matching (description-only) hits at the end without dropping them", () => {
    const ranked = rankByTitle(titles, "zzz");
    expect(ranked).toHaveLength(titles.length);
    expect(ranked.map((t) => t.title)).toEqual(titles.map((t) => t.title));
  });
});
