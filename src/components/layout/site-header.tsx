import { Fragment } from "react";
import type { Route } from "next";
import Link from "next/link";
import { LogOut, User } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { AutoBreadcrumbs } from "@/components/layout/auto-breadcrumbs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { NotificationBell, type BellNotification } from "@/components/layout/notification-bell";
import { logoutAction } from "@/server/services/auth-actions";

export interface BreadcrumbEntry {
  label: string;
  href?: Route;
}

export function SiteHeader({
  userEmail,
  breadcrumbs,
  notifications,
  unreadCount,
}: {
  userEmail: string;
  /** Overrides the auto-derived (from URL) breadcrumb trail — e.g. a detail
   * page that wants "Order #1234" in place of the generic "Details" crumb. */
  breadcrumbs?: BreadcrumbEntry[];
  notifications: BellNotification[];
  unreadCount: number;
}) {
  const initial = userEmail.charAt(0).toUpperCase();

  return (
    <header className="bg-background/95 flex h-14 shrink-0 items-center gap-2 border-b px-4 backdrop-blur">
      <SidebarTrigger />
      <Separator orientation="vertical" className="h-5" />
      {breadcrumbs && breadcrumbs.length > 0 ? (
        <Breadcrumb className="min-w-0">
          <BreadcrumbList className="flex-nowrap overflow-hidden">
            {breadcrumbs.map((crumb, index) => {
              const isLast = index === breadcrumbs.length - 1;
              return (
                <Fragment key={crumb.label}>
                  <BreadcrumbItem className={isLast ? "min-w-0 truncate" : "shrink-0"}>
                    {crumb.href && !isLast ? (
                      <BreadcrumbLink render={<Link href={crumb.href}>{crumb.label}</Link>} />
                    ) : (
                      <BreadcrumbPage className="truncate">{crumb.label}</BreadcrumbPage>
                    )}
                  </BreadcrumbItem>
                  {!isLast && <BreadcrumbSeparator />}
                </Fragment>
              );
            })}
          </BreadcrumbList>
        </Breadcrumb>
      ) : (
        <AutoBreadcrumbs />
      )}
      <div className="ml-auto flex items-center gap-1">
        <NotificationBell notifications={notifications} unreadCount={unreadCount} />
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon" className="rounded-full">
                <Avatar className="size-8">
                  <AvatarFallback>{initial}</AvatarFallback>
                </Avatar>
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="text-muted-foreground truncate text-xs font-normal">
              {userEmail}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              render={
                <Link href="/profile">
                  <User />
                  Profile
                </Link>
              }
            />
            <DropdownMenuSeparator />
            <form action={logoutAction} className="w-full">
              <DropdownMenuItem
                render={
                  <button type="submit" className="w-full cursor-pointer">
                    <LogOut />
                    Log out
                  </button>
                }
              />
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
