import { describe, expect, it } from "vitest";
import { LEGAL_PAGES, isLegalSlug, splitParagraphs } from "@/lib/legal-pages";

describe("splitParagraphs", () => {
  it("starts a new paragraph at a blank line and keeps single line breaks inside one", () => {
    expect(splitParagraphs("One\nstill one\n\nTwo\n\n\n\nThree")).toEqual([
      "One\nstill one",
      "Two",
      "Three",
    ]);
  });

  it("handles Windows line endings", () => {
    expect(splitParagraphs("A\r\n\r\nB")).toEqual(["A", "B"]);
  });

  it("gives nothing for empty or whitespace-only text, which means the page is not published", () => {
    expect(splitParagraphs("")).toEqual([]);
    expect(splitParagraphs("  \n\n \n")).toEqual([]);
  });

  it("leaves markup as plain text for the page to escape", () => {
    expect(splitParagraphs("<script>alert(1)</script>")).toEqual(["<script>alert(1)</script>"]);
  });
});

describe("legal page list", () => {
  it("has the three pages with distinct addresses", () => {
    expect(LEGAL_PAGES.map((page) => page.path)).toEqual(["/terms", "/privacy", "/refund-policy"]);
    expect(new Set(LEGAL_PAGES.map((page) => page.slug)).size).toBe(3);
  });

  it("recognises only its own slugs", () => {
    expect(isLegalSlug("terms")).toBe(true);
    expect(isLegalSlug("admin")).toBe(false);
  });
});
