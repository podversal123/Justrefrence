import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  isLocale,
  translate,
  type Locale,
  type Messages,
  type TranslateVars,
} from "@/i18n/locales";
import { formatDate, formatDateTime } from "@/lib/format";
import { HI_MESSAGES } from "@/i18n/messages/hi";

/** The visitor's language for this request (from their cookie), English if they never chose one. */
export const getLocale = cache(async (): Promise<Locale> => {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
});

export function messagesFor(locale: Locale): Messages {
  return locale === "hi" ? HI_MESSAGES : {};
}

export type TFunction = (text: string, vars?: TranslateVars) => string;

/** `const t = await getT();` then `t("Orders")`. For Server Components and Server Actions. */
export async function getT(): Promise<TFunction> {
  const messages = messagesFor(await getLocale());
  return (text, vars) => translate(messages, text, vars);
}

/** Dates written in the visitor's language: `const { formatDate } = await getFormat();`. */
export async function getFormat() {
  const locale = await getLocale();
  return {
    formatDate: (value: Date | string) => formatDate(value, locale),
    formatDateTime: (value: Date | string) => formatDateTime(value, locale),
  };
}
