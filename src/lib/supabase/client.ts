"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client — safe to use in Client Components.
 * Uses only the public URL + anon key (RLS-restricted). See docs/security.md §6.
 */
export function createClient() {
  return createBrowserClient(
    process.env["NEXT_PUBLIC_SUPABASE_URL"]!,
    process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"]!,
  );
}
