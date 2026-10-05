import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/server/auth/session";
import { AdminDashboard } from "@/components/dashboard/admin-dashboard";
import { SuperAdminDashboard } from "@/components/dashboard/super-admin-dashboard";
import { VendorDashboard } from "@/components/dashboard/vendor-dashboard";
import { CustomerDashboard } from "@/components/dashboard/customer-dashboard";

export const metadata: Metadata = { title: "Dashboard" };

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

  if (session.roles.includes("SUPER_ADMIN")) {
    return <SuperAdminDashboard searchParams={await searchParams} />;
  }

  if (session.roles.some((role) => STAFF_ROLES.includes(role))) {
    return <AdminDashboard searchParams={await searchParams} />;
  }

  if (session.hasVendorProfile) {
    return <VendorDashboard session={session} />;
  }

  return <CustomerDashboard session={session} />;
}
