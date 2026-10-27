import { getT } from "@/i18n/server";
import { Fragment } from "react";
import type { Route } from "next";
import Link from "next/link";
import { LogOut, MessageSquareText, Settings, User } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { NotificationBell, type BellNotification } from "@/components/layout/notification-bell";
import { logoutAction } from "@/server/services/auth-actions";
import { LanguageSwitch } from "@/components/layout/language-switch";

export interface BreadcrumbEntry {
  label: string;
  href?: Route;
}

export async function SiteHeader({
  userEmail,
  panelLabel,
  roleLabel,
  breadcrumbs,
  notifications,
  unreadCount,
  memberShortcuts = null,
  memberIds = null,
}: {
  userEmail: string;
  /** E.g. "Admin panel" and "Super Admin", shown so it is always clear who is signed in. */
  panelLabel: string;
  roleLabel: string;
  /** Overrides the auto-derived (from URL) breadcrumb trail — e.g. a detail
   * page that wants "Order #1234" in place of the generic "Details" crumb. */
  breadcrumbs?: BreadcrumbEntry[];
  notifications: BellNotification[];
  unreadCount: number;
  /** For a member: shortcuts to SMS (with its unread count) and profile settings, next to the bell. */
  memberShortcuts?: { smsUnread: number | null } | null;
  /** For a member: their own Member ID and, if someone referred them, that person's Member ID. */
  memberIds?: { memberId: string; referralId: string | null } | null;
}) {
  const initial = userEmail.charAt(0).toUpperCase();
  const t = await getT();

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
      {memberIds ? (
        <dl className="ml-4 hidden items-baseline gap-x-5 text-sm md:flex">
          <div className="flex items-baseline gap-1.5">
            <dt className="text-muted-foreground">{t("Member ID")}</dt>
            <dd className="font-mono font-medium">{memberIds.memberId}</dd>
          </div>
          {memberIds.referralId ? (
            <div className="flex items-baseline gap-1.5">
              <dt className="text-muted-foreground">{t("Referral ID")}</dt>
              <dd className="font-mono font-medium">{memberIds.referralId}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      <div className="ml-auto flex items-center gap-1">
        <LanguageSwitch />
        {memberShortcuts ? (
          <>
            {memberShortcuts.smsUnread !== null ? (
              <Button
                variant="ghost"
                size="icon"
                className="relative rounded-full"
                nativeButton={false}
                render={
                  <Link href={"/sms" as Route} aria-label={t("SMS inbox")} title={t("SMS inbox")}>
                    <MessageSquareText className="size-4" />
                    {memberShortcuts.smsUnread > 0 ? (
                      <Badge
                        variant="destructive"
                        className="absolute -top-1 -right-1 h-4 min-w-4 justify-center rounded-full px-1 text-[10px]"
                      >
                        {memberShortcuts.smsUnread > 9 ? "9+" : memberShortcuts.smsUnread}
                      </Badge>
                    ) : null}
                  </Link>
                }
              />
            ) : null}
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full"
              nativeButton={false}
              render={
                <Link
                  href="/profile"
                  aria-label={t("Profile settings")}
                  title={t("Profile settings")}
                >
                  <Settings className="size-4" />
                </Link>
              }
            />
          </>
        ) : null}
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
              <span className="text-foreground block truncate font-medium">{userEmail}</span>
              <span className="block">
                {panelLabel} · {roleLabel}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              render={
                <Link href="/profile">
                  <User />
                  {t("Profile")}
                </Link>
              }
            />
            <DropdownMenuSeparator />
            <form action={logoutAction} className="w-full">
              <DropdownMenuItem
                render={
                  <button type="submit" className="w-full cursor-pointer">
                    <LogOut />
                    {t("Log out")}
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
