import { describe, expect, it } from "vitest";
import { NAV_GROUPS } from "@/components/layout/nav-config";
import {
  SIDEBAR_STRUCTURE,
  resolveSidebar,
  type StructureEntry,
} from "@/components/layout/sidebar-structure";
import type { Panel } from "@/server/auth/panel";

const allItems = NAV_GROUPS.flatMap((g) => g.items);
const hrefsPlaced = (panel: Panel): string[] =>
  SIDEBAR_STRUCTURE[panel].flatMap((e: StructureEntry) =>
    e.kind === "link" ? [e.href] : [...e.hrefs],
  );

describe("sidebar structure", () => {
  it("gives every page a member can see a place in the Member panel", () => {
    const placed = new Set(hrefsPlaced("CUSTOMER"));
    for (const item of allItems.filter((i) => !i.panels || i.panels.includes("CUSTOMER"))) {
      // Admin pages have no panels tag and are never shown to a member.
      if (!item.panels && item.href.startsWith("/admin")) continue;
      if (!item.panels && item.href === "/audit-log") continue;
      // No menu lists Profile: it is reached from the header (settings icon and account menu).
      if (!item.panels && item.href === "/profile") continue;
      expect(placed.has(item.href), item.href).toBe(true);
    }
  });

  it("gives every seller page, and the member pages a seller without a member account needs, a place in the Seller / Vendor panel", () => {
    const placed = new Set(hrefsPlaced("VENDOR"));
    for (const item of allItems.filter((i) => i.panels)) {
      // Someone who is already a seller is never offered "Become a seller".
      if ((item.href as string) === "/become-seller") continue;
      expect(placed.has(item.href), item.href).toBe(true);
    }
    for (const href of ["/dashboard", "/messages"]) {
      expect(placed.has(href), href).toBe(true);
    }
  });

  it("gives every page a place in the Admin panel, so nothing a staff account may open goes missing", () => {
    const placed = new Set(hrefsPlaced("ADMIN"));
    for (const item of allItems) {
      if (item.href === "/profile") continue; // reached from the header, not the menu
      expect(placed.has(item.href), item.href).toBe(true);
    }
  });

  it("places a page only once in a panel", () => {
    for (const panel of ["CUSTOMER", "VENDOR", "ADMIN"] as const) {
      const hrefs = hrefsPlaced(panel);
      expect(new Set(hrefs).size, panel).toBe(hrefs.length);
    }
  });

  it("only names pages that exist", () => {
    const known = new Set(allItems.map((i) => i.href as string));
    for (const panel of ["CUSTOMER", "VENDOR", "ADMIN"] as const) {
      for (const href of hrefsPlaced(panel)) expect(known.has(href), `${panel} ${href}`).toBe(true);
    }
  });
});

describe("resolveSidebar", () => {
  const page = (href: string) => [href, { href }] as const;

  it("keeps the order of the structure and groups related pages into a dropdown", () => {
    const visible = new Map([
      page("/dashboard"),
      page("/cart"),
      page("/orders"),
      page("/wallet"),
      page("/account-report"),
    ]);
    const result = resolveSidebar("CUSTOMER", visible);
    expect(result.map((e) => (e.kind === "link" ? e.item.href : e.section.key))).toEqual([
      "/dashboard",
      "purchase",
      "/account-report",
      "/wallet",
    ]);
  });

  it("drops a dropdown with nothing visible", () => {
    const result = resolveSidebar("CUSTOMER", new Map([page("/dashboard")]));
    expect(result).toHaveLength(1);
  });

  it("shows a dropdown with a single visible page as a plain link", () => {
    const result = resolveSidebar("CUSTOMER", new Map([page("/dashboard"), page("/wallet")]));
    expect(result.map((e) => e.kind)).toEqual(["link", "link"]);
  });

  it("lists only the pages that are visible inside a dropdown", () => {
    const result = resolveSidebar(
      "ADMIN",
      new Map([page("/admin/members"), page("/admin/vendors"), page("/admin/kyc")]),
    );
    const people = result.find((e) => e.kind === "section");
    expect(people?.kind === "section" && people.items.map((i) => i.href)).toEqual([
      "/admin/members",
      "/admin/vendors",
      "/admin/kyc",
    ]);
  });
});
