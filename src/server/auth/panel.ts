/**
 * Which "panel" a signed-in person is working in. One login and one app serve everyone; the
 * panel is derived from the roles they hold, and it decides which navigation they see and
 * which route areas open (every page and action still checks its own permission, this is the
 * outer layer, not a replacement).
 *
 *   ADMIN    any role other than CUSTOMER/VENDOR: Super Admin, Admin, Finance, Support and any
 *            custom role an admin builds. These people manage the platform. A Super Admin sees
 *            the same menu filtered by what they may do, under a "Super Admin panel" label.
 *   VENDOR   holds the VENDOR role (an approved seller): lists products, services and projects,
 *            fills orders, bids.
 *   CUSTOMER everyone else, shown as the Member panel: buys, refers, uses the wallet.
 *
 * A member who is also an approved seller can switch between the Member and Seller / Vendor
 * panels; the choice is kept in a cookie and only honoured for someone who really has both.
 *
 * Pure (no I/O) so it is easy to test and safe to import anywhere.
 */
import { msg } from "@/i18n/locales";

export type Panel = "ADMIN" | "VENDOR" | "CUSTOMER";

const MEMBER_ROLES = new Set(["CUSTOMER", "VENDOR"]);

export const PANEL_LABELS: Record<Panel, string> = {
  ADMIN: msg("Admin panel"),
  VENDOR: msg("Seller / Vendor panel"),
  CUSTOMER: msg("Member panel"),
};

const SUPER_ADMIN_PANEL_LABEL = msg("Super Admin panel");

/** Cookie that remembers which panel a member who is also a seller last chose. */
export const PANEL_COOKIE = "jr_panel";
export type SwitchablePanel = "VENDOR" | "CUSTOMER";

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: msg("Super Admin"),
  ADMIN: msg("Admin"),
  FINANCE: msg("Finance"),
  SUPPORT: msg("Support"),
  VENDOR: msg("Vendor"),
  CUSTOMER: msg("Member"),
};

export interface PanelSubject {
  roles: readonly string[];
  hasVendorProfile: boolean;
  /** Whether the account has a member profile (member ID, referral code). */
  hasMemberProfile?: boolean;
  /** The panel a member who is also a seller last chose, read from the cookie. */
  preferredPanel?: SwitchablePanel | null;
}

export function isStaff(subject: Pick<PanelSubject, "roles">): boolean {
  return subject.roles.some((role) => !MEMBER_ROLES.has(role));
}

/**
 * A request to become a seller creates a vendor profile straight away, but the VENDOR role only
 * arrives when the Super Admin approves it, so the role (not the profile) decides who is a seller.
 */
export function isSeller(subject: Pick<PanelSubject, "roles">): boolean {
  return subject.roles.includes("VENDOR");
}

/** True for an approved seller who is also a member, the only person who gets the panel switch. */
export function canSwitchPanel(subject: PanelSubject): boolean {
  return !isStaff(subject) && isSeller(subject) && subject.hasMemberProfile === true;
}

export function getPanel(subject: PanelSubject): Panel {
  if (isStaff(subject)) return "ADMIN";
  if (!isSeller(subject)) return "CUSTOMER";
  if (canSwitchPanel(subject)) return subject.preferredPanel === "VENDOR" ? "VENDOR" : "CUSTOMER";
  return "VENDOR";
}

/** The name shown on screen for the panel this person is in. */
export function panelLabelFor(subject: PanelSubject): string {
  const panel = getPanel(subject);
  if (panel === "ADMIN" && subject.roles.includes("SUPER_ADMIN")) return SUPER_ADMIN_PANEL_LABEL;
  return PANEL_LABELS[panel];
}

/** "SUPER_ADMIN" becomes "Super Admin"; an unknown custom code is title-cased the same way. */
export function roleLabel(code: string): string {
  const known = ROLE_LABELS[code];
  if (known) return known;
  return code
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** The person's role names in plain words, most important first, e.g. "Super Admin". */
export function describeRoles(roles: readonly string[]): string {
  if (roles.length === 0) return "No role assigned";
  const staffFirst = [...roles].sort(
    (a, b) => Number(MEMBER_ROLES.has(a)) - Number(MEMBER_ROLES.has(b)),
  );
  return staffFirst.map(roleLabel).join(", ");
}
