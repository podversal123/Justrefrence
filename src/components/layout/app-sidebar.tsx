"use client";

import type { ReactNode } from "react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRightLeft } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { switchPanelAction } from "@/server/services/panel-actions";
import { cn } from "@/lib/utils";
import type { Panel } from "@/server/auth/panel";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

interface SidebarNavItem {
  title: string;
  href: Route;
  icon: ReactNode;
}

interface SidebarNavGroup {
  label: string;
  items: SidebarNavItem[];
}

const PANEL_STYLES: Record<Panel, string> = {
  // Light-on-dark: the sidebar background is the dark ink colour.
  ADMIN: "bg-white/15 text-white",
  VENDOR: "bg-amber-400/20 text-amber-200",
  CUSTOMER: "bg-emerald-400/20 text-emerald-200",
};

export function AppSidebar({
  groups,
  userEmail,
  roleLabel,
  panel,
  panelLabel,
  isSuperAdmin = false,
  switchTo = null,
}: {
  groups: SidebarNavGroup[];
  userEmail: string;
  roleLabel: string;
  panel: Panel;
  panelLabel: string;
  isSuperAdmin?: boolean;
  /** Set for a member who is also a seller: the panel the switch button opens. */
  switchTo?: { panel: "VENDOR" | "CUSTOMER"; label: string } | null;
}) {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link href="/dashboard" className="flex items-center gap-2 px-2 py-1.5">
          <Logo size={28} />
          <span className="text-sm font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
            Justreference
          </span>
        </Link>
        <p
          className={cn(
            "mx-2 w-fit rounded-full px-2.5 py-0.5 text-xs font-semibold group-data-[collapsible=icon]:hidden",
            isSuperAdmin ? "bg-rose-400/25 text-rose-100" : PANEL_STYLES[panel],
          )}
        >
          {panelLabel}
        </p>
      </SidebarHeader>
      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={pathname === item.href}
                      tooltip={item.title}
                      render={
                        <Link href={item.href}>
                          {item.icon}
                          <span>{item.title}</span>
                        </Link>
                      }
                    />
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
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
        <div className="text-muted-foreground truncate px-2 py-1 text-xs group-data-[collapsible=icon]:hidden">
          <div className="text-foreground truncate font-medium">{userEmail}</div>
          <div>{roleLabel}</div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
