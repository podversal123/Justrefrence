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
  | "sms"
  | "projects"
  | "sale"
  | "purchase"
  | "earnings"
  | "bonus"
  | "coupons"
  | "report"
  | "referral"
  | "epin"
  | "wallet"
  | "support"
  | "security"
  | "accounts"
  | "payments"
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
    | "gavel"
    | "shield"
    | "coins"
    | "bank"
    | "briefcase"
    | "gift"
    | "ticket"
    | "help";
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
const MEMBER_PAGES: readonly string[] = memberMenu()
  .flatMap((entry) => (entry.kind === "link" ? [entry.href] : [...entry.hrefs]))
  // These already sit elsewhere in the admin menu (the top links, and Communication).
  .filter((href) => !["/dashboard", "/profile", "/messages"].includes(href));

/**
 * The member / seller menu, in the order of the client's document. The same list serves the Member
 * and the Seller / Vendor panel: what each person actually sees is decided by their role and
 * permissions, so entries that do not apply to them (a seller's "Sale", a member's "Products list")
 * simply do not show.
 */
function memberMenu(): StructureEntry[] {
  return [
    link("/dashboard"),
    link("/api/welcome-letter"),
    section("sms", msg("SMS and messages"), "message", [
      "/sms",
      "/messages",
      "/messages?box=sent",
      "/messages?box=drafts",
      "/messages#compose",
    ]),
    link("/vendor/profile"),
    section("projects", msg("Projects"), "briefcase", [
      "/my-projects?stage=running",
      "/my-projects?stage=complete",
      "/my-projects?stage=cancelled",
      "/my-projects",
      "/vendor/catalog/projects/new",
      "/requirements/new",
    ]),
    section("sale", msg("Sale"), "store", [
      "/sale-purchase?side=sale&stage=new",
      "/sale-purchase?side=sale&stage=old",
      "/cart?from=sale",
      "/vendor/orders",
    ]),
    section("purchase", msg("Purchase"), "bag", [
      "/sale-purchase?side=purchase&stage=new",
      "/sale-purchase?side=purchase&stage=old",
      "/cart",
      "/sale-purchase",
      "/orders",
      "/requirements",
      "/my-auctions",
    ]),
    section("tenders", msg("Bids and auctions"), "gavel", [
      "/bids",
      "/my-bids",
      "/vendor/auctions",
    ]),
    link("/vendor/catalog/services"),
    link("/services"),
    link("/vendor/catalog/products"),
    link("/products"),
    link("/vendor/catalog/projects"),
    link("/invoices"),
    section("earnings", msg("Earnings"), "network", [
      "/earnings",
      "/earnings?tab=business",
      "/earnings?tab=business&view=referral",
      "/earnings?tab=business&view=search#business-search",
      "/earnings?tab=business&view=total",
    ]),
    section("bonus", msg("Bonus and rewards"), "gift", [
      "/rewards",
      "/rewards?type=CASH",
      "/rewards?type=COUPON",
      "/rewards?type=OTHER",
    ]),
    section("coupons", msg("My coupons"), "gift", [
      "/coupons",
      "/coupons#coupons-available",
      "/coupons#coupons-used",
      "/coupons#coupons-unavailable",
    ]),
    section("report", msg("Account report"), "coins", [
      "/account-report",
      "/account-report?type=credit",
      "/account-report?type=debit",
    ]),
    section("referral", msg("Referrals"), "users", ["/referrals", "/referrals#create"]),
    section("epin", msg("E-pins"), "ticket", ["/subscription", "/subscription#redeem"]),
    section("wallet", msg("Wallet"), "wallet", [
      "/wallet",
      "/wallet#topup",
      "/wallet#transfer",
      "/wallet#payout",
      "/wallet#payout-report",
      "/wallet#balance-transfer",
      "/wallet#transactions",
      "/wallet#pin",
    ]),
    section("support", msg("Support"), "help", ["/support?new=1", "/support"]),
    link("/vendor/ads"),
    link("/advertisements"),
    link("/blog"),
    link("/become-seller"),
  ];
}

export const SIDEBAR_STRUCTURE: Record<Panel, readonly StructureEntry[]> = {
  CUSTOMER: memberMenu(),

  VENDOR: memberMenu(),

  ADMIN: [
    link("/dashboard"),
    link("/admin/approvals"),
    link("/admin/members?register=1"),
    section("catalogue", msg("Catalogue"), "package", [
      "/admin/catalog/products",
      "/admin/catalog/projects",
      "/admin/catalog/services",
    ]),
    section("people", msg("Members"), "users", [
      "/admin/members",
      "/admin/members?view=edit",
      "/admin/members?view=bank",
      "/admin/members?view=report",
      "/admin/members?view=messages",
      "/admin/orders?view=invoices",
      "/admin/members?view=referrals",
      "/admin/members?view=datewise",
      "/admin/members?view=moderate",
      "/admin/members?status=BLOCKED",
      "/admin/members?view=filter",
      "/admin/vendors",
      "/admin/kyc",
    ]),
    section("security", msg("Security and E-PIN"), "shield", [
      "/admin/members?view=security",
      "/admin/epins",
      "/admin/epins?status=FRESH",
      "/admin/epins?status=USED",
      "/admin/epins?view=search",
      "/admin/subscription-plans",
    ]),
    section("accounts", msg("Accounts and earnings"), "coins", [
      "/admin/commissions?status=ELIGIBLE",
      "/admin/commissions",
      "/admin/wallets",
      "/admin/subscription-plans?view=income",
      "/admin/wallets?view=withdrawn",
      "/admin/payouts?status=PAID",
      "/admin/commission-rules",
    ]),
    section("payments", msg("Payments and transfers"), "bank", [
      "/admin/payouts?status=REQUESTED",
      "/admin/rewards",
      "/admin/tds",
      "/admin/rewards?view=list",
      "/admin/payouts",
    ]),
    section("sales", msg("Orders and offers"), "cart", [
      "/admin/orders",
      "/admin/bids",
      "/admin/auctions",
      "/admin/coupons",
    ]),
    section("talk", msg("Communication"), "message", [
      "/messages",
      "/admin/support",
      "/admin/sms",
      "/admin/resumes",
      "/admin/announcements",
      "/admin/banners",
      "/admin/ads",
      "/admin/blog",
    ]),
    link("/admin/feedback"),
    section("system", msg("Settings"), "settings", [
      "/admin/settings",
      "/admin/settings#maintenance",
      "/admin/admins",
      "/admin/roles",
      "/admin/legal",
      "/audit-log",
    ]),
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
