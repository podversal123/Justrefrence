"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { LOCALE_COOKIE, isLocale } from "@/i18n/locales";
import type { ApiResult } from "@/lib/api-response";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** Remembers the visitor's language in a cookie. Works for signed-in and signed-out visitors alike. */
export async function setLocaleAction(locale: string): Promise<ApiResult<null>> {
  const requestId = crypto.randomUUID();
  if (!isLocale(locale)) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: "That language is not available." },
      meta: { requestId },
    };
  }
  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
    sameSite: "lax",
    // Read by the server on every request and by nothing in the browser, so script can't touch it.
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
  revalidatePath("/", "layout");
  return { success: true, data: null, meta: { requestId } };
}
