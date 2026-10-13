import { redirect } from "next/navigation";
import { getAuthSession } from "@/server/auth/session";
import { getPanel } from "@/server/auth/panel";

/**
 * Everything under /admin belongs to the admin panel. This is the outer gate; each page and
 * action still checks its own permission (a Support account must not open Payouts).
 */
export default async function AdminAreaLayout({ children }: { children: React.ReactNode }) {
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (getPanel(session) !== "ADMIN") redirect("/unauthorized");
  return children;
}
