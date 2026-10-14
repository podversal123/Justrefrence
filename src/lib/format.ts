import { localeTag, type Locale } from "@/i18n/locales";

const TIME_ZONE = "Asia/Kolkata";

const dateFormats = new Map<Locale, Intl.DateTimeFormat>();
const dateTimeFormats = new Map<Locale, Intl.DateTimeFormat>();

function dateFormat(locale: Locale) {
  let format = dateFormats.get(locale);
  if (!format) {
    format = new Intl.DateTimeFormat(localeTag(locale), {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: TIME_ZONE,
    });
    dateFormats.set(locale, format);
  }
  return format;
}

function dateTimeFormat(locale: Locale) {
  let format = dateTimeFormats.get(locale);
  if (!format) {
    format = new Intl.DateTimeFormat(localeTag(locale), {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: TIME_ZONE,
    });
    dateTimeFormats.set(locale, format);
  }
  return format;
}

/** "5 Oct 2026" (or "5 अक्तू॰ 2026") — fixed to IST so server and client render identically (no hydration drift). */
export function formatDate(value: Date | string, locale: Locale = "en"): string {
  return dateFormat(locale).format(new Date(value));
}

/** "5 Oct 2026, 3:20 pm" in IST. */
export function formatDateTime(value: Date | string, locale: Locale = "en"): string {
  return dateTimeFormat(locale).format(new Date(value));
}
