import { PortalFooter } from "@/components/portal/portal-footer";
import { PortalHeader } from "@/components/portal/portal-header";
import { MaintenanceNotice } from "@/components/portal/maintenance-notice";
import { getAuthSession } from "@/server/auth/session";
import { canBypassMaintenance, getSiteSettings } from "@/server/lib/site-settings";

/**
 * The public marketing/catalog shell — deliberately NOT the (dashboard)
 * sidebar layout (no auth required, no proxy.ts gate on these paths, see
 * src/proxy.ts's PROTECTED_PREFIXES). Customers browse without an account;
 * "Sign in" is offered, never required, to reach a listing. The cart icon
 * itself routes into the protected /cart page — proxy.ts redirects an
 * anonymous visitor to /login from there, same as any other protected page.
 */
export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const [settings, session] = await Promise.all([getSiteSettings(), getAuthSession()]);
  if (settings.maintenanceEnabled && !canBypassMaintenance(session)) {
    return <MaintenanceNotice message={settings.maintenanceMessage} />;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="bg-background focus:ring-ring sr-only z-50 rounded-md px-3 py-2 text-sm focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:ring-2"
      >
        Skip to content
      </a>
      <PortalHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <PortalFooter />
    </div>
  );
}
