"use client";

import type { ReactNode } from "react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/brand/logo";
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
}: {
  groups: SidebarNavGroup[];
  userEmail: string;
  roleLabel: string;
  panel: Panel;
  panelLabel: string;
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
            PANEL_STYLES[panel],
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
        <div className="text-muted-foreground truncate px-2 py-1 text-xs group-data-[collapsible=icon]:hidden">
          <div className="text-foreground truncate font-medium">{userEmail}</div>
          <div>{roleLabel}</div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
