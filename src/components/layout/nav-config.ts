import type { LucideIcon } from "lucide-react";
import {
  Banknote,
  Briefcase,
  ClipboardList,
  Gavel,
  CreditCard,
  FileText,
  LayoutDashboard,
  Landmark,
  LifeBuoy,
  Mail,
  MessageSquareText,
  Newspaper,
  Package,
  Percent,
  TicketPercent,
  Receipt,
  Settings,
  ScrollText,
  ShieldCheck,
  ShoppingCart,
  Store,
  Tags,
  Ticket,
  User,
  UserCog,
  Users,
  UsersRound,
  Wallet,
  Wrench,
} from "lucide-react";
import type { Route } from "next";
import type { AuthSession } from "@/server/auth/session";

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export interface NavItem {
  title: string;
  href: Route;
  icon: LucideIcon;
  /** Return true if this item should be visible for the given session. */
  visible: (session: Pick<AuthSession, "permissions" | "hasVendorProfile">) => boolean;
}

/**
 * The full nav catalog, grouped. What actually renders for a given user is
 * filtered by `visible()` in the (dashboard) layout — see docs/rbac.md §1
 * ("frontend hiding is a UX convenience, not a security boundary": every one
 * of these destinations is ALSO independently gated server-side on its own
 * page/Server Action).
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard, visible: () => true },
      { title: "My profile", href: "/profile", icon: User, visible: () => true },
      {
        title: "Cart",
        href: "/cart",
        icon: ShoppingCart,
        visible: (s) => s.permissions.has("cart:manage"),
      },
      {
        title: "My orders",
        href: "/orders",
        icon: Receipt,
        visible: (s) => s.permissions.has("order:create"),
      },
      {
        title: "Invoices",
        href: "/invoices" as Route,
        icon: FileText,
        visible: (s) => s.permissions.has("invoice:read"),
      },
      {
        title: "Vendor orders",
        href: "/vendor/orders",
        icon: Receipt,
        visible: (s) => s.hasVendorProfile && s.permissions.has("order:update_status"),
      },
      {
        title: "My referrals",
        href: "/referrals",
        icon: Users,
        visible: (s) => s.permissions.has("referral:read"),
      },
      {
        title: "My wallet",
        href: "/wallet",
        icon: Wallet,
        visible: (s) => s.permissions.has("wallet:read"),
      },
      {
        title: "My coupons",
        href: "/coupons" as Route,
        icon: TicketPercent,
        visible: (s) => s.permissions.has("coupon:redeem"),
      },
      {
        title: "My subscription",
        href: "/subscription",
        icon: CreditCard,
        visible: (s) => s.permissions.has("subscription:read"),
      },
      {
        title: "My requirements",
        href: "/requirements" as Route,
        icon: ClipboardList,
        visible: (s) => s.permissions.has("requirement:create"),
      },
      {
        title: "Bid opportunities",
        href: "/bids" as Route,
        icon: Gavel,
        visible: (s) => s.hasVendorProfile && s.permissions.has("bid:submit"),
      },
      {
        title: "My bids",
        href: "/my-bids" as Route,
        icon: Gavel,
        visible: (s) => s.hasVendorProfile && s.permissions.has("bid:submit"),
      },
      {
        title: "Messages",
        href: "/messages",
        icon: Mail,
        visible: (s) => s.permissions.has("message:read"),
      },
      {
        title: "Support",
        href: "/support",
        icon: LifeBuoy,
        visible: (s) => s.permissions.has("ticket:read"),
      },
      {
        title: "My vendor profile",
        href: "/vendor/profile",
        icon: Store,
        visible: (s) => s.hasVendorProfile,
      },
      {
        title: "My products",
        href: "/vendor/catalog/products" as Route,
        icon: Package,
        visible: (s) => s.hasVendorProfile && s.permissions.has("product:read"),
      },
      {
        title: "My services",
        href: "/vendor/catalog/services" as Route,
        icon: Wrench,
        visible: (s) => s.hasVendorProfile && s.permissions.has("service:read"),
      },
      {
        title: "My projects",
        href: "/vendor/catalog/projects" as Route,
        icon: Briefcase,
        visible: (s) => s.hasVendorProfile && s.permissions.has("project:read"),
      },
    ],
  },
  {
    // Staff-wide catalog management — hidden for vendors (they have their
    // own "My products/services/projects" above, scoped to their own
    // listings only) even though VENDOR also holds these `:read` permissions.
    label: "Catalog",
    items: [
      {
        title: "Products",
        href: "/admin/catalog/products" as Route,
        icon: Package,
        visible: (s) => s.permissions.has("product:approve"),
      },
      {
        title: "Services",
        href: "/admin/catalog/services" as Route,
        icon: Wrench,
        visible: (s) => s.permissions.has("service:approve"),
      },
      {
        title: "Projects",
        href: "/admin/catalog/projects" as Route,
        icon: Briefcase,
        visible: (s) => s.permissions.has("project:approve"),
      },
    ],
  },
  {
    label: "Administration",
    items: [
      {
        title: "Admins",
        href: "/admin/admins",
        icon: UserCog,
        visible: (s) => s.permissions.has("user:read"),
      },
      {
        title: "Vendors",
        href: "/admin/vendors",
        icon: Store,
        visible: (s) => s.permissions.has("member:read:any"),
      },
      {
        title: "Members",
        href: "/admin/members" as Route,
        icon: UsersRound,
        visible: (s) => s.permissions.has("member:read:any"),
      },
      {
        title: "All orders",
        href: "/admin/orders" as Route,
        icon: Receipt,
        visible: (s) => s.permissions.has("order:read:any"),
      },
      {
        title: "Coupons",
        href: "/admin/coupons" as Route,
        icon: TicketPercent,
        visible: (s) => s.permissions.has("coupon:create"),
      },
      {
        title: "All bids",
        href: "/admin/bids" as Route,
        icon: Gavel,
        visible: (s) => s.permissions.has("bid:read:any"),
      },
      {
        title: "Support tickets",
        href: "/admin/support" as Route,
        icon: LifeBuoy,
        visible: (s) => s.permissions.has("ticket:read:any"),
      },
      {
        title: "Blog",
        href: "/admin/blog" as Route,
        icon: Newspaper,
        visible: (s) => s.permissions.has("blog:create"),
      },
      {
        title: "Feedback",
        href: "/admin/feedback" as Route,
        icon: MessageSquareText,
        visible: (s) => s.permissions.has("feedback:read"),
      },
      {
        title: "Roles & permissions",
        href: "/admin/roles",
        icon: ShieldCheck,
        visible: (s) => s.permissions.has("role:read"),
      },
      {
        title: "Settings",
        href: "/admin/settings" as Route,
        icon: Settings,
        visible: (s) => s.permissions.has("settings:read"),
      },
      {
        title: "Audit log",
        href: "/audit-log",
        icon: ScrollText,
        visible: (s) => s.permissions.has("audit:read"),
      },
      {
        title: "Commission rules",
        href: "/admin/commission-rules",
        icon: Percent,
        visible: (s) => s.permissions.has("commission_rule:read"),
      },
      {
        title: "Payouts",
        href: "/admin/payouts",
        icon: Banknote,
        visible: (s) => s.permissions.has("payout:approve"),
      },
      {
        title: "Wallets",
        href: "/admin/wallets",
        icon: Landmark,
        visible: (s) => s.permissions.has("wallet:read:any"),
      },
      {
        title: "E-pins",
        href: "/admin/epins" as Route,
        icon: Ticket,
        visible: (s) => s.permissions.has("epin:read:any"),
      },
      {
        title: "Subscription plans",
        href: "/admin/subscription-plans" as Route,
        icon: Tags,
        visible: (s) => s.permissions.has("subscription_plan:manage"),
      },
    ],
  },
];
