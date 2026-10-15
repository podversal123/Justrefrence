import { msg } from "@/i18n/locales";
import { getT } from "@/i18n/server";
import Link from "next/link";
import type { Route } from "next";
import type { LucideIcon } from "lucide-react";
import { Percent, ScrollText, ShieldCheck, Store, UserCog } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AdminDashboard } from "./admin-dashboard";

/**
 * The five platform-authority destinations Admin can't reach — paths
 * confirmed against src/components/layout/nav-config.ts's NAV_GROUPS
 * ("Administration" group) rather than guessed.
 */
const PLATFORM_CONTROLS: { title: string; description: string; href: Route; icon: LucideIcon }[] = [
  {
    title: msg("Roles & permissions"),
    description: msg("Define roles and the permissions each one grants."),
    href: "/admin/roles",
    icon: ShieldCheck,
  },
  {
    title: msg("Vendor approvals"),
    description: msg("Review, approve, or reject pending vendor applications."),
    href: "/admin/vendors",
    icon: Store,
  },
  {
    title: msg("Audit log"),
    description: msg("Review a record of sensitive actions taken across the platform."),
    href: "/audit-log",
    icon: ScrollText,
  },
  {
    title: msg("Commission rules"),
    description: msg("Configure how referral commissions are calculated."),
    href: "/admin/commission-rules",
    icon: Percent,
  },
  {
    title: msg("Admins"),
    description: msg("Manage administrator accounts and their role assignments."),
    href: "/admin/admins",
    icon: UserCog,
  },
];

/**
 * Super Admin's dashboard is deliberately NOT a separate implementation —
 * it reuses AdminDashboard's data fetching and widgets as-is (same
 * operational numbers Admin sees) and adds the one thing Admin structurally
 * cannot see: platform-level authority. The banner and border make the
 * elevation visually unmistakable rather than a silent re-skin.
 */
export async function SuperAdminDashboard({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const t = await getT();
  return (
    <div className="flex flex-col gap-8">
      <div className="bg-surface-sunken border-primary flex flex-wrap items-center gap-3 rounded-lg border-l-4 px-4 py-3">
        <Badge variant="outline" className="gap-1.5 py-1 text-xs font-semibold">
          <ShieldCheck className="size-3.5" />
          {t("Super Admin")}
        </Badge>
        <p className="text-muted-foreground text-sm">
          {t(
            "Everything Admin sees below, plus the platform-level controls only Super Admin can reach.",
          )}
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t("Platform controls")}</h2>
          <p className="text-muted-foreground text-sm">
            {t(
              "Controls only a Super Admin has: role management, vendor approval and system settings.",
            )}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PLATFORM_CONTROLS.map((control) => (
            <Link
              key={control.href}
              href={control.href}
              className="hover:bg-muted focus-visible:ring-ring/50 bg-background flex min-h-11 items-start gap-3 rounded-lg border p-4 transition-colors outline-none focus-visible:ring-3"
            >
              <div className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-lg">
                <control.icon className="size-4" />
              </div>
              <div className="flex flex-col gap-0.5">
                <p className="text-sm font-medium">{t(control.title)}</p>
                <p className="text-muted-foreground text-xs">{t(control.description)}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <div className="flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t("Operational dashboard")}</h2>
          <p className="text-muted-foreground text-sm">{t("The same platform data Admin sees.")}</p>
        </div>
        <div className="border-primary/30 border-l-4 pl-4 sm:pl-6">
          <AdminDashboard searchParams={searchParams} />
        </div>
      </div>
    </div>
  );
}
