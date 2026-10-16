import { msg } from "@/i18n/locales";
import { getT } from "@/i18n/server";
import Link from "next/link";
import type { Route } from "next";
import type { LucideIcon } from "lucide-react";
import { Percent, ScrollText, Settings, ShieldCheck, UserCog } from "lucide-react";
import { AdminDashboard } from "./admin-dashboard";
import { NeedsAttention } from "./needs-attention";

/**
 * The places only a Super Admin can open, so they are one click from the first screen. Paths follow
 * NAV_GROUPS in src/components/layout/nav-config.ts.
 */
const PLATFORM_CONTROLS: { title: string; description: string; href: Route; icon: LucideIcon }[] = [
  {
    title: msg("Roles & permissions"),
    description: msg("Decide what each role is allowed to do."),
    href: "/admin/roles",
    icon: ShieldCheck,
  },
  {
    title: msg("Admins"),
    description: msg("Add admins and choose their roles."),
    href: "/admin/admins",
    icon: UserCog,
  },
  {
    title: msg("Commission rules"),
    description: msg("Set how much referrers earn."),
    href: "/admin/commission-rules",
    icon: Percent,
  },
  {
    title: msg("Settings"),
    description: msg("Maintenance mode, contact details and auto logout."),
    href: "/admin/settings" as Route,
    icon: Settings,
  },
  {
    title: msg("Audit log"),
    description: msg("See who did what, and when."),
    href: "/audit-log",
    icon: ScrollText,
  },
];

/**
 * The Super Admin's first screen: what needs a decision, the controls only they have, and then the
 * same platform numbers and charts Admin sees (reused as they are, not copied).
 */
export async function SuperAdminDashboard({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const t = await getT();
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1>{t("Super Admin dashboard")}</h1>
        <p className="text-muted-foreground">
          {t("You can see and manage everything on the platform from here.")}
        </p>
      </div>

      <NeedsAttention />

      <section className="flex flex-col gap-3" aria-labelledby="platform-controls-title">
        <div>
          <h2 id="platform-controls-title" className="text-lg font-semibold">
            {t("Only for Super Admin")}
          </h2>
          <p className="text-muted-foreground text-sm">
            {t("Admins can't open these. You decide who gets access.")}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PLATFORM_CONTROLS.map((control) => (
            <Link
              key={control.href}
              href={control.href}
              className="hover:bg-muted focus-visible:ring-ring/50 bg-card flex min-h-11 items-start gap-3 rounded-lg border p-4 transition-colors outline-none focus-visible:ring-3"
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

      <AdminDashboard searchParams={searchParams} embedded />
    </div>
  );
}
