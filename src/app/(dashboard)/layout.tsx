import { redirect } from "next/navigation";
import { getAuthSession } from "@/server/auth/session";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { SiteHeader } from "@/components/layout/site-header";
import { NAV_GROUPS } from "@/components/layout/nav-config";
import { MaintenanceNotice } from "@/components/portal/maintenance-notice";
import { canBypassMaintenance, getSiteSettings } from "@/server/lib/site-settings";
import {
  countUnreadNotifications,
  listRecentNotifications,
} from "@/server/repositories/identity/notification-repository";

/**
 * The protected dashboard shell. Redirects unauthenticated visitors here as
 * a second, defense-in-depth check alongside src/middleware.ts (see
 * docs/architecture.md §7 — every layer re-checks, nothing trusts the layer
 * above it blindly). Nav items are filtered by the session's actual
 * permissions/vendor-profile status — this is the "role-aware navigation"
 * requirement; every item that renders here is ALSO independently gated on
 * its own page.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getAuthSession();

  if (!session) {
    redirect("/login");
  }

  if (session.status === "BLOCKED") {
    redirect("/unauthorized");
  }

  // Maintenance mode: everyone except staff sees the notice instead of the app.
  const siteSettings = await getSiteSettings();
  if (siteSettings.maintenanceEnabled && !canBypassMaintenance(session)) {
    return <MaintenanceNotice message={siteSettings.maintenanceMessage} />;
  }

  /*
   * AppSidebar is a Client Component, so what we pass it must be RSC-
   * serializable — plain data only. NAV_GROUPS items carry a LucideIcon
   * component reference and a `visible` predicate function, neither of
   * which can cross the server→client boundary as-is ("Functions cannot
   * be passed directly to Client Components"). `visible` is consumed here
   * (server-only); the icon is rendered into an element here instead of
   * being passed as a component reference — a React element IS
   * serializable, a bare function/component type is not.
   */
  const visibleGroups = NAV_GROUPS.map((group) => ({
    label: group.label,
    items: group.items
      .filter((item) => item.visible(session))
      .map((item) => ({ title: item.title, href: item.href, icon: <item.icon /> })),
  })).filter((group) => group.items.length > 0);

  const roleLabel = session.roles.length > 0 ? session.roles.join(", ") : "No role assigned";

  const [notifications, unreadCount] = await Promise.all([
    listRecentNotifications(session.userId),
    countUnreadNotifications(session.userId),
  ]);

  return (
    <SidebarProvider>
      <AppSidebar groups={visibleGroups} userEmail={session.email} roleLabel={roleLabel} />
      <SidebarInset>
        <SiteHeader
          userEmail={session.email}
          notifications={notifications}
          unreadCount={unreadCount}
        />
        {/* SidebarInset above already renders the page's single <main> landmark. */}
        <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
