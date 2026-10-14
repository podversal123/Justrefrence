/**
 * Which "panel" a signed-in person is working in. One login and one app serve everyone; the
 * panel is derived from the roles they hold, and it decides which navigation they see and
 * which route areas open (every page and action still checks its own permission, this is the
 * outer layer, not a replacement).
 *
 *   ADMIN    any role other than CUSTOMER/VENDOR: Super Admin, Admin, Finance, Support and any
 *            custom role an admin builds. These people manage the platform.
 *   VENDOR   holds a vendor profile: lists products, services and projects, fills orders, bids.
 *   CUSTOMER everyone else: buys, refers, uses the wallet.
 *
 * Pure (no I/O) so it is easy to test and safe to import anywhere.
 */
import { msg } from "@/i18n/locales";

export type Panel = "ADMIN" | "VENDOR" | "CUSTOMER";

const MEMBER_ROLES = new Set(["CUSTOMER", "VENDOR"]);

export const PANEL_LABELS: Record<Panel, string> = {
  ADMIN: msg("Admin panel"),
  VENDOR: msg("Vendor panel"),
  CUSTOMER: msg("Customer panel"),
};

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: msg("Super Admin"),
  ADMIN: msg("Admin"),
  FINANCE: msg("Finance"),
  SUPPORT: msg("Support"),
  VENDOR: msg("Vendor"),
  CUSTOMER: msg("Customer"),
};

export interface PanelSubject {
  roles: readonly string[];
  hasVendorProfile: boolean;
}

export function isStaff(subject: Pick<PanelSubject, "roles">): boolean {
  return subject.roles.some((role) => !MEMBER_ROLES.has(role));
}

export function getPanel(subject: PanelSubject): Panel {
  if (isStaff(subject)) return "ADMIN";
  if (subject.hasVendorProfile || subject.roles.includes("VENDOR")) return "VENDOR";
  return "CUSTOMER";
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
