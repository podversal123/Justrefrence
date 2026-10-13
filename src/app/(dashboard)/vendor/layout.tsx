import { redirect } from "next/navigation";
import { getAuthSession } from "@/server/auth/session";

/**
 * Everything under /vendor belongs to the vendor panel: it needs a vendor profile. Catalog
 * ownership is still enforced on every page and action; this is the outer gate.
 */
export default async function VendorAreaLayout({ children }: { children: React.ReactNode }) {
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (!session.hasVendorProfile) redirect("/unauthorized");
  return children;
}
