import { getT } from "@/i18n/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/server/auth/session";
import { AdminDashboard } from "@/components/dashboard/admin-dashboard";
import { SuperAdminDashboard } from "@/components/dashboard/super-admin-dashboard";
import { VendorDashboard } from "@/components/dashboard/vendor-dashboard";
import { CustomerDashboard } from "@/components/dashboard/customer-dashboard";
import { AnnouncementsStrip } from "@/components/dashboard/announcements-strip";
import { getPanel, type Panel } from "@/server/auth/panel";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Dashboard") };
}

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

const STAFF_ROLES = ["ADMIN", "FINANCE"];

/*
 * Five distinct dashboards, one route — Phase 10 brief calls for Customer,
 * Vendor, Admin and Super Admin to be genuinely different surfaces, not
 * variations on one generic view. Precedence: Super Admin > staff
 * (Admin/Finance) > vendor > plain customer, since a Super Admin who also
 * happens to have a vendor profile should still see the platform-authority
 * view, not the self-service vendor one.
 */
export default async function DashboardPage({ searchParams }: PageProps) {
  const session = await getAuthSession();
  if (!session) redirect("/login");

  const panel: Panel = getPanel(session);
  const strip = <AnnouncementsStrip panel={panel} />;
  if (session.roles.includes("SUPER_ADMIN")) {
    return (
      <>
        {strip}
        <SuperAdminDashboard searchParams={await searchParams} />
      </>
    );
  }

  if (session.roles.some((role) => STAFF_ROLES.includes(role))) {
    return (
      <>
        {strip}
        <AdminDashboard searchParams={await searchParams} />
      </>
    );
  }

  if (session.hasVendorProfile) {
    return (
      <>
        {strip}
        <VendorDashboard session={session} />
      </>
    );
  }

  return (
    <>
      {strip}
      <CustomerDashboard session={session} />
    </>
  );
}
