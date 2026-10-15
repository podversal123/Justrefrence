import type { Route } from "next";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/server/auth/session";
import { isSeller, isStaff } from "@/server/auth/panel";

/**
 * Everything under /vendor is for approved sellers. A member whose request to sell is still waiting
 * (or who never asked) is sent to the page where they can ask or see where their request stands.
 * This is the outer gate; each page and action still checks its own permission.
 */
export default async function VendorAreaLayout({ children }: { children: React.ReactNode }) {
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (isSeller(session) || isStaff(session)) return children;
  redirect((session.permissions.has("vendor:apply") ? "/become-seller" : "/unauthorized") as Route);
}
