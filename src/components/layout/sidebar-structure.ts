import { msg } from "@/i18n/locales";
import type { Panel } from "@/server/auth/panel";

/**
 * How each panel's sidebar is laid out: single links, and dropdowns that gather the pages that belong
 * together (so the menu stays short). Only the placement lives here; the title, icon and who may see a
 * page still come from NAV_GROUPS in nav-config.ts, looked up by link. A test checks that every page a
 * panel can show has a place here, so a new page cannot quietly go missing from the menu.
 *
 * Pure, no I/O, so it is easy to test.
 */

export type SectionKey =
  | "people"
  | "catalogue"
  | "sales"
  | "money"
  | "talk"
  | "system"
  | "mine"
  | "shopping"
  | "network"
  | "selling"
  | "tenders"
  | "buying";

export interface SectionDefinition {
  key: SectionKey;
  label: string;
  /** Names an icon in the sidebar's icon table (kept as text so this file stays plain data). */
  icon:
    | "users"
    | "package"
    | "cart"
    | "wallet"
    | "message"
    | "settings"
    | "user"
    | "bag"
    | "network"
    | "store"
    | "gavel";
}

export type StructureEntry =
  | { kind: "link"; href: string }
  | { kind: "section"; section: SectionDefinition; hrefs: readonly string[] };

const section = (
  key: SectionKey,
  label: string,
  icon: SectionDefinition["icon"],
  hrefs: readonly string[],
): StructureEntry => ({ kind: "section", section: { key, label, icon }, hrefs });

const link = (href: string): StructureEntry => ({ kind: "link", href });

/** Every page a member or seller can use, for a staff account that is also a member or seller. */
const MEMBER_PAGES = [
  "/cart",
  "/orders",
  "/invoices",
  "/requirements",
  "/my-auctions",
  "/referrals",
  "/earnings",
  "/rewards",
  "/coupons",
  "/wallet",
  "/account-report",
  "/subscription",
  "/sms",
  "/support",
  "/blog",
  "/become-seller",
  // A staff account that is also a seller keeps its selling pages too.
  "/vendor/profile",
  "/vendor/orders",
  "/vendor/catalog/products",
  "/vendor/catalog/services",
  "/vendor/catalog/projects",
  "/bids",
  "/my-bids",
  "/vendor/auctions",
  "/vendor/ads",
] as const;

export const SIDEBAR_STRUCTURE: Record<Panel, readonly StructureEntry[]> = {
  CUSTOMER: [
    link("/dashboard"),
    link("/profile"),
    section("shopping", msg("Shopping and orders"), "bag", [
      "/cart",
      "/orders",
      "/invoices",
      "/requirements",
      "/my-auctions",
    ]),
    section("network", msg("Referrals and earnings"), "network", [
      "/referrals",
      "/earnings",
      "/rewards",
      "/coupons",
    ]),
    section("money", msg("Wallet and money"), "wallet", [
      "/wallet",
      "/account-report",
      "/subscription",
    ]),
    section("talk", msg("Messages and help"), "message", ["/sms", "/messages", "/support"]),
    link("/blog"),
    link("/become-seller"),
  ],

  VENDOR: [
    link("/dashboard"),
    link("/profile"),
    link("/vendor/profile"),
    section("selling", msg("Selling"), "store", [
      "/vendor/orders",
      "/vendor/catalog/products",
      "/vendor/catalog/services",
      "/vendor/catalog/projects",
    ]),
    section("tenders", msg("Bids and auctions"), "gavel", [
      "/bids",
      "/my-bids",
      "/vendor/auctions",
    ]),
    link("/vendor/ads"),
    // The pages below show here only for a seller who has no member account to switch to.
    section("buying", msg("Buying"), "bag", ["/cart", "/orders", "/requirements", "/my-auctions"]),
    section("money", msg("Wallet and money"), "wallet", [
      "/invoices",
      "/wallet",
      "/account-report",
      "/subscription",
    ]),
    section("network", msg("Referrals and earnings"), "network", [
      "/referrals",
      "/earnings",
      "/rewards",
      "/coupons",
    ]),
    section("talk", msg("Messages and help"), "message", ["/sms", "/messages", "/support"]),
    link("/blog"),
  ],

  ADMIN: [
    link("/dashboard"),
    link("/profile"),
    link("/admin/approvals"),
    section("people", msg("People"), "users", [
      "/admin/members",
      "/admin/vendors",
      "/admin/kyc",
      "/admin/admins",
      "/admin/roles",
    ]),
    section("catalogue", msg("Catalogue"), "package", [
      "/admin/catalog/products",
      "/admin/catalog/services",
      "/admin/catalog/projects",
    ]),
    section("sales", msg("Orders and offers"), "cart", [
      "/admin/orders",
      "/admin/bids",
      "/admin/auctions",
      "/admin/coupons",
      "/admin/rewards",
    ]),
    section("money", msg("Money"), "wallet", [
      "/admin/payouts",
      "/admin/wallets",
      "/admin/tds",
      "/admin/commission-rules",
      "/admin/epins",
      "/admin/subscription-plans",
    ]),
    section("talk", msg("Communication"), "message", [
      "/messages",
      "/admin/support",
      "/admin/sms",
      "/admin/feedback",
      "/admin/announcements",
      "/admin/banners",
      "/admin/ads",
      "/admin/blog",
    ]),
    section("system", msg("System"), "settings", ["/admin/settings", "/audit-log"]),
    section("mine", msg("My own account"), "user", MEMBER_PAGES),
  ],
};

/** What the menu shows for one panel: the structure with only the pages this person may see. */
export type ResolvedEntry<T> =
  { kind: "link"; item: T } | { kind: "section"; section: SectionDefinition; items: T[] };

/**
 * Applies the structure to the pages this person may see. A dropdown with nothing visible is dropped,
 * and a dropdown with a single page shows as a plain link, since opening it would add nothing.
 */
export function resolveSidebar<T>(
  panel: Panel,
  visible: ReadonlyMap<string, T>,
): ResolvedEntry<T>[] {
  const entries: ResolvedEntry<T>[] = [];
  for (const entry of SIDEBAR_STRUCTURE[panel]) {
    if (entry.kind === "link") {
      const item = visible.get(entry.href);
      if (item) entries.push({ kind: "link", item });
      continue;
    }
    const items = entry.hrefs.flatMap((href) => {
      const item = visible.get(href);
      return item ? [item] : [];
    });
    if (items.length === 0) continue;
    if (items.length === 1) entries.push({ kind: "link", item: items[0]! });
    else entries.push({ kind: "section", section: entry.section, items });
  }
  return entries;
}
