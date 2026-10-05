"use client";

import type { ReactNode } from "react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/brand/logo";
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

export function AppSidebar({
  groups,
  userEmail,
  roleLabel,
}: {
  groups: SidebarNavGroup[];
  userEmail: string;
  roleLabel: string;
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
