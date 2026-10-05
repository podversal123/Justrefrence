import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Server-side Supabase client for Server Components, Server Actions, and
 * Route Handlers. Always call `getUser()` (never `getSession()`) when the
 * result drives an authorization decision — `getUser()` revalidates the JWT
 * against Supabase Auth instead of trusting an unverified cookie payload.
 * A fresh client is created per request, per @supabase/ssr's own guidance —
 * never module-level singleton this one (unlike the Prisma client).
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env["NEXT_PUBLIC_SUPABASE_URL"]!,
    process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"]!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component that can't set cookies — safe to
            // ignore as long as middleware.ts is also refreshing the session
            // (see src/middleware.ts), per @supabase/ssr's documented caveat.
          }
        },
      },
    },
  );
}
