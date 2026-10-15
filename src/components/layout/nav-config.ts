import { msg } from "@/i18n/locales";
import type { LucideIcon } from "lucide-react";
import {
  Banknote,
  Briefcase,
  ClipboardCheck,
  ClipboardList,
  Gavel,
  Gift,
  CreditCard,
  FileText,
  ImageIcon,
  Megaphone,
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
  TrendingUp,
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
  /** Something a buyer or vendor does for themselves (cart, own orders, own wallet). Hidden from staff-only accounts. */
  memberOnly?: boolean;
  /** Return true if this item should be visible for the given session. */
  visible: (
    session: Pick<AuthSession, "permissions" | "hasVendorProfile" | "hasMemberProfile">,
  ) => boolean;
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
    label: msg("Workspace"),
    items: [
      { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard, visible: () => true },
      { title: "Profile", href: "/profile", icon: User, visible: () => true },
      {
        title: msg("Cart"),
        memberOnly: true,
        href: "/cart",
        icon: ShoppingCart,
        visible: (s) => s.permissions.has("cart:manage"),
      },
      {
        title: msg("Orders"),
        memberOnly: true,
        href: "/orders",
        icon: Receipt,
        visible: (s) => s.permissions.has("order:create"),
      },
      {
        title: msg("Invoices"),
        memberOnly: true,
        href: "/invoices" as Route,
        icon: FileText,
        visible: (s) => s.permissions.has("invoice:read"),
      },
      {
        title: msg("Vendor orders"),
        href: "/vendor/orders",
        icon: Receipt,
        visible: (s) => s.hasVendorProfile && s.permissions.has("order:update_status"),
      },
      {
        title: msg("Referrals"),
        memberOnly: true,
        href: "/referrals",
        icon: Users,
        visible: (s) => s.hasMemberProfile && s.permissions.has("referral:read"),
      },
      {
        title: msg("Wallet"),
        memberOnly: true,
        href: "/wallet",
        icon: Wallet,
        visible: (s) => s.permissions.has("wallet:read"),
      },
      {
        title: msg("Earnings"),
        memberOnly: true,
        href: "/earnings" as Route,
        icon: TrendingUp,
        visible: (s) => s.hasMemberProfile && s.permissions.has("commission:read"),
      },
      {
        title: msg("Account report"),
        memberOnly: true,
        href: "/account-report" as Route,
        icon: FileText,
        visible: (s) => s.permissions.has("wallet:read"),
      },
      {
        title: msg("Coupons"),
        memberOnly: true,
        href: "/coupons" as Route,
        icon: TicketPercent,
        visible: (s) => s.permissions.has("coupon:redeem"),
      },
      {
        title: msg("Rewards"),
        memberOnly: true,
        href: "/rewards" as Route,
        icon: Gift,
        visible: (s) => s.permissions.has("reward:read"),
      },
      {
        title: msg("Subscription"),
        memberOnly: true,
        href: "/subscription",
        icon: CreditCard,
        visible: (s) => s.permissions.has("subscription:read"),
      },
      {
        title: msg("Requirements"),
        memberOnly: true,
        href: "/requirements" as Route,
        icon: ClipboardList,
        visible: (s) => s.permissions.has("requirement:create"),
      },
      {
        title: msg("Bid opportunities"),
        href: "/bids" as Route,
        icon: Gavel,
        visible: (s) => s.hasVendorProfile && s.permissions.has("bid:submit"),
      },
      {
        title: msg("Bids"),
        href: "/my-bids" as Route,
        icon: Gavel,
        visible: (s) => s.hasVendorProfile && s.permissions.has("bid:submit"),
      },
      {
        title: msg("Auction bids"),
        memberOnly: true,
        href: "/my-auctions" as Route,
        icon: Gavel,
        visible: (s) => s.permissions.has("auction:bid"),
      },
      {
        title: msg("Auctions"),
        href: "/vendor/auctions" as Route,
        icon: Gavel,
        visible: (s) => s.hasVendorProfile && s.permissions.has("auction:create"),
      },
      {
        title: msg("Advertisements"),
        href: "/vendor/ads" as Route,
        icon: Megaphone,
        visible: (s) => s.hasVendorProfile && s.permissions.has("ad:create"),
      },
      {
        title: msg("SMS inbox"),
        memberOnly: true,
        href: "/sms" as Route,
        icon: MessageSquareText,
        visible: (s) => s.permissions.has("sms:read"),
      },
      {
        title: msg("Messages"),
        href: "/messages",
        icon: Mail,
        visible: (s) => s.permissions.has("message:read"),
      },
      {
        title: msg("Support"),
        memberOnly: true,
        href: "/support",
        icon: LifeBuoy,
        visible: (s) => s.permissions.has("ticket:read"),
      },
      {
        title: msg("Vendor profile"),
        href: "/vendor/profile",
        icon: Store,
        visible: (s) => s.hasVendorProfile,
      },
      {
        title: msg("Products"),
        href: "/vendor/catalog/products" as Route,
        icon: Package,
        visible: (s) => s.hasVendorProfile && s.permissions.has("product:read"),
      },
      {
        title: msg("Services"),
        href: "/vendor/catalog/services" as Route,
        icon: Wrench,
        visible: (s) => s.hasVendorProfile && s.permissions.has("service:read"),
      },
      {
        title: msg("Projects"),
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
    label: msg("Catalog"),
    items: [
      {
        title: msg("Products"),
        href: "/admin/catalog/products" as Route,
        icon: Package,
        visible: (s) => s.permissions.has("product:approve"),
      },
      {
        title: msg("Services"),
        href: "/admin/catalog/services" as Route,
        icon: Wrench,
        visible: (s) => s.permissions.has("service:approve"),
      },
      {
        title: msg("Projects"),
        href: "/admin/catalog/projects" as Route,
        icon: Briefcase,
        visible: (s) => s.permissions.has("project:approve"),
      },
    ],
  },
  {
    label: msg("Administration"),
    items: [
      {
        title: msg("Approvals"),
        href: "/admin/approvals" as Route,
        icon: ClipboardCheck,
        visible: (s) => s.permissions.has("change:review") || s.permissions.has("change:request"),
      },
      {
        title: msg("Admins"),
        href: "/admin/admins",
        icon: UserCog,
        visible: (s) => s.permissions.has("user:read"),
      },
      {
        title: msg("Vendors"),
        href: "/admin/vendors",
        icon: Store,
        visible: (s) => s.permissions.has("member:read:any"),
      },
      {
        title: msg("Members"),
        href: "/admin/members" as Route,
        icon: UsersRound,
        visible: (s) => s.permissions.has("member:read:any"),
      },
      {
        title: msg("KYC review"),
        href: "/admin/kyc" as Route,
        icon: ShieldCheck,
        visible: (s) => s.permissions.has("kyc:review"),
      },
      {
        title: msg("All orders"),
        href: "/admin/orders" as Route,
        icon: Receipt,
        visible: (s) => s.permissions.has("order:read:any"),
      },
      {
        title: msg("Coupons"),
        href: "/admin/coupons" as Route,
        icon: TicketPercent,
        visible: (s) => s.permissions.has("coupon:create"),
      },
      {
        title: msg("Rewards"),
        href: "/admin/rewards" as Route,
        icon: Gift,
        visible: (s) => s.permissions.has("reward:read:any"),
      },
      {
        title: msg("All bids"),
        href: "/admin/bids" as Route,
        icon: Gavel,
        visible: (s) => s.permissions.has("bid:read:any"),
      },
      {
        title: msg("All auctions"),
        href: "/admin/auctions" as Route,
        icon: Gavel,
        visible: (s) => s.permissions.has("auction:read:any"),
      },
      {
        title: msg("Support tickets"),
        href: "/admin/support" as Route,
        icon: LifeBuoy,
        visible: (s) => s.permissions.has("ticket:read:any"),
      },
      {
        title: msg("SMS"),
        href: "/admin/sms" as Route,
        icon: MessageSquareText,
        visible: (s) => s.permissions.has("sms:send"),
      },
      {
        title: msg("Advertisements"),
        href: "/admin/ads" as Route,
        icon: Megaphone,
        visible: (s) => s.permissions.has("ad:review"),
      },
      {
        title: msg("Announcements"),
        href: "/admin/announcements" as Route,
        icon: Megaphone,
        visible: (s) => s.permissions.has("announcement:manage"),
      },
      {
        title: msg("Banners"),
        href: "/admin/banners" as Route,
        icon: ImageIcon,
        visible: (s) => s.permissions.has("banner:manage"),
      },
      {
        title: msg("Blog"),
        href: "/admin/blog" as Route,
        icon: Newspaper,
        visible: (s) => s.permissions.has("blog:create"),
      },
      {
        title: msg("Feedback"),
        href: "/admin/feedback" as Route,
        icon: MessageSquareText,
        visible: (s) => s.permissions.has("feedback:read"),
      },
      {
        title: msg("Roles & permissions"),
        href: "/admin/roles",
        icon: ShieldCheck,
        visible: (s) => s.permissions.has("role:read"),
      },
      {
        title: msg("Settings"),
        href: "/admin/settings" as Route,
        icon: Settings,
        visible: (s) => s.permissions.has("settings:read"),
      },
      {
        title: msg("Audit log"),
        href: "/audit-log",
        icon: ScrollText,
        visible: (s) => s.permissions.has("audit:read"),
      },
      {
        title: msg("Commission rules"),
        href: "/admin/commission-rules",
        icon: Percent,
        visible: (s) => s.permissions.has("commission_rule:read"),
      },
      {
        title: msg("Payouts"),
        href: "/admin/payouts",
        icon: Banknote,
        visible: (s) => s.permissions.has("payout:approve"),
      },
      {
        title: msg("TDS list"),
        href: "/admin/tds" as Route,
        icon: Receipt,
        visible: (s) => s.permissions.has("tds:read:any"),
      },
      {
        title: msg("Wallets"),
        href: "/admin/wallets",
        icon: Landmark,
        visible: (s) => s.permissions.has("wallet:read:any"),
      },
      {
        title: msg("E-pins"),
        href: "/admin/epins" as Route,
        icon: Ticket,
        visible: (s) => s.permissions.has("epin:read:any"),
      },
      {
        title: msg("Subscription plans"),
        href: "/admin/subscription-plans" as Route,
        icon: Tags,
        visible: (s) => s.permissions.has("subscription_plan:manage"),
      },
    ],
  },
];
