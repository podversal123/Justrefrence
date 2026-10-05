import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Next.js "proxy" convention (formerly "middleware") — runs on the Edge
 * runtime, Supabase session refresh only. Deliberately does NOT resolve
 * roles/permissions here: that needs Prisma's `pg` driver adapter, which
 * requires Node.js TCP sockets and cannot run on Edge. Full RBAC
 * (docs/rbac.md) is enforced in the (dashboard) layout and in every Server
 * Action / Route Handler via authorize() — see docs/architecture.md §7.
 * This proxy is a coarse "is there a session at all" gate plus cookie
 * refresh, nothing more.
 */

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/audit-log",
  "/profile",
  "/vendor",
  "/admin",
  "/cart",
  "/checkout",
  "/orders",
  "/referrals",
  "/wallet",
  "/subscription",
  "/support",
  "/messages",
  "/invoices",
  "/coupons",
  "/requirements",
  "/my-bids",
];
const AUTH_ONLY_PREFIXES = ["/login", "/forgot-password", "/register"];

export async function proxy(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const isAuthOnly = AUTH_ONLY_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (isProtected && !user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthOnly && user) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static assets and image optimization,
     * so the session cookie stays fresh across the whole app.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|gif)$).*)",
  ],
};
