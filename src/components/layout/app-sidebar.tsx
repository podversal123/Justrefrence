"use client";

import { useState, type ReactNode } from "react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useT } from "@/i18n/provider";
import {
  ArrowRightLeft,
  Banknote,
  Briefcase,
  ChevronDown,
  CircleDollarSign,
  Gavel,
  Gift,
  Landmark,
  LifeBuoy,
  LogOut,
  MessageSquare,
  Network,
  Package,
  Settings,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Store,
  Ticket,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";
import type { Panel } from "@/server/auth/panel";
import { logoutAction } from "@/server/services/auth-actions";
import { switchPanelAction } from "@/server/services/panel-actions";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";

export interface SidebarNavItem {
  title: string;
  href: Route;
  icon: ReactNode;
}

/** A single link, or a dropdown that gathers the pages that belong together. */
export type SidebarEntry =
  | { kind: "link"; item: SidebarNavItem }
  | { kind: "section"; key: string; label: string; icon: string; items: SidebarNavItem[] };

const SECTION_ICONS: Record<string, LucideIcon> = {
  users: Users,
  package: Package,
  cart: ShoppingCart,
  wallet: Landmark,
  message: MessageSquare,
  settings: Settings,
  user: User,
  bag: ShoppingBag,
  network: Network,
  store: Store,
  shield: ShieldCheck,
  briefcase: Briefcase,
  gift: Gift,
  ticket: Ticket,
  help: LifeBuoy,
  coins: CircleDollarSign,
  bank: Banknote,
  gavel: Gavel,
};

const PANEL_STYLES: Record<Panel, string> = {
  // Light-on-dark: the sidebar background is the dark ink colour.
  ADMIN: "bg-white/15 text-white",
  VENDOR: "bg-amber-400/20 text-amber-200",
  CUSTOMER: "bg-emerald-400/20 text-emerald-200",
};

/**
 * How well a menu link matches the page being viewed, or -1 for no match. A link is current on its own
 * address and on anything below it (an order's page counts as Orders). A link that carries a filter
 * ("?status=BLOCKED") only matches while that filter is applied, and a link to a spot on a page
 * ("#maintenance") is never marked, so it cannot compete with the page link itself.
 */
function matchScore(pathname: string, search: URLSearchParams, href: string): number {
  const target = new URL(href, "http://local");
  if (target.hash) return -1;
  const onPage = pathname === target.pathname || pathname.startsWith(`${target.pathname}/`);
  if (!onPage) return -1;
  let filters = 0;
  for (const [key, value] of target.searchParams) {
    if (search.get(key) !== value) return -1;
    filters += 1;
  }
  return target.pathname.length * 10 + filters;
}

/** The one link to mark as current: the closest match, so "Blocked members" wins over "Members" while its filter is on. */
function pickActive(
  entries: SidebarEntry[],
  pathname: string,
  search: URLSearchParams,
): string | null {
  let best: { href: string; score: number } | null = null;
  const consider = (href: string) => {
    const score = matchScore(pathname, search, href);
    if (score >= 0 && (!best || score > best.score)) best = { href, score };
  };
  for (const entry of entries) {
    if (entry.kind === "link") consider(entry.item.href);
    else for (const item of entry.items) consider(item.href);
  }
  return best ? (best as { href: string }).href : null;
}

function SectionDropdown({
  entry,
  active,
}: {
  entry: Extract<SidebarEntry, { kind: "section" }>;
  active: string | null;
}) {
  const { state, isMobile, setOpen } = useSidebar();
  const containsCurrent = entry.items.some((item) => item.href === active);
  // Open by default when the page you are on lives in it; after that you decide.
  const [chosen, setChosen] = useState<boolean | null>(null);
  const open = chosen ?? containsCurrent;
  const Icon = SECTION_ICONS[entry.icon] ?? Package;
  const panelId = `sidebar-section-${entry.key}`;
  const collapsedToIcons = state === "collapsed" && !isMobile;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        type="button"
        isActive={containsCurrent && !open}
        tooltip={entry.label}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          // With the menu squeezed to icons there is nowhere to show the pages, so open it up first.
          if (collapsedToIcons) {
            setOpen(true);
            setChosen(true);
            return;
          }
          setChosen(!open);
        }}
      >
        <Icon />
        <span>{entry.label}</span>
        <ChevronDown
          className={cn(
            "ml-auto size-4 shrink-0 transition-transform group-data-[collapsible=icon]:hidden",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </SidebarMenuButton>
      <div
        id={panelId}
        className={cn(
          "grid transition-[grid-template-rows] duration-200 group-data-[collapsible=icon]:hidden",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <SidebarMenuSub className="my-1" inert={!open}>
            {entry.items.map((item) => (
              <SidebarMenuSubItem key={item.href}>
                <SidebarMenuSubButton
                  isActive={item.href === active}
                  render={
                    <Link href={item.href}>
                      {item.icon}
                      <span>{item.title}</span>
                    </Link>
                  }
                />
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </div>
      </div>
    </SidebarMenuItem>
  );
}

export function AppSidebar({
  entries,
  userEmail,
  roleLabel,
  panel,
  panelLabel,
  isSuperAdmin = false,
  switchTo = null,
}: {
  entries: SidebarEntry[];
  userEmail: string;
  roleLabel: string;
  panel: Panel;
  panelLabel: string;
  isSuperAdmin?: boolean;
  /** Set for a member who is also a seller: the panel the switch button opens. */
  switchTo?: { panel: "VENDOR" | "CUSTOMER"; label: string } | null;
}) {
  const t = useT();
  const pathname = usePathname();
  const search = useSearchParams();
  const active = pickActive(entries, pathname, search);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link href="/dashboard" className="flex items-center gap-2 px-2 py-1.5">
          <Logo size={28} />
          <span className="text-sm font-medium group-data-[collapsible=icon]:hidden">
            Justreference
          </span>
        </Link>
        <p
          className={cn(
            "mx-2 w-fit rounded-sm px-2 py-0.5 text-xs font-medium group-data-[collapsible=icon]:hidden",
            isSuperAdmin ? "bg-rose-400/25 text-rose-100" : PANEL_STYLES[panel],
          )}
        >
          {panelLabel}
        </p>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {entries.map((entry) =>
                entry.kind === "link" ? (
                  <SidebarMenuItem key={entry.item.href}>
                    <SidebarMenuButton
                      isActive={entry.item.href === active}
                      tooltip={entry.item.title}
                      render={
                        <Link href={entry.item.href}>
                          {entry.item.icon}
                          <span>{entry.item.title}</span>
                        </Link>
                      }
                    />
                  </SidebarMenuItem>
                ) : (
                  <SectionDropdown key={entry.key} entry={entry} active={active} />
                ),
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        {switchTo ? (
          <form action={switchPanelAction} className="px-2 group-data-[collapsible=icon]:hidden">
            <input type="hidden" name="panel" value={switchTo.panel} />
            <button
              type="submit"
              className="border-sidebar-border hover:bg-sidebar-accent flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs font-medium"
            >
              <ArrowRightLeft className="size-4 shrink-0" aria-hidden="true" />
              {switchTo.label}
            </button>
          </form>
        ) : null}
        <form action={logoutAction} className="px-2 group-data-[collapsible=icon]:hidden">
          <button
            type="submit"
            className="border-sidebar-border hover:bg-sidebar-accent flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs font-medium"
          >
            <LogOut className="size-4 shrink-0" aria-hidden="true" />
            {t("Log out")}
          </button>
        </form>
        <div className="text-muted-foreground truncate px-2 py-1 text-xs group-data-[collapsible=icon]:hidden">
          <div className="text-foreground truncate font-medium">{userEmail}</div>
          <div>{roleLabel}</div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
