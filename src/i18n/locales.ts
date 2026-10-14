/**
 * Languages the site can show. The choice is kept in a cookie (no change to any URL), read on the
 * server for every request, so a page renders in the right language the first time.
 */

export const LOCALES = ["en", "hi"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "jr_lang";

/** Each language is named in its own script, so a visitor can always find theirs. */
export const LOCALE_LABEL: Record<Locale, string> = {
  en: "English",
  hi: "हिन्दी",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export type Messages = Readonly<Record<string, string>>;
export type TranslateVars = Record<string, string | number>;

/**
 * The English sentence is the key. A sentence with no translation is shown in English, so a missing
 * entry can never break a page. `{name}` placeholders are filled from `vars`.
 */
export function translate(messages: Messages, text: string, vars?: TranslateVars): string {
  const template = messages[text] ?? text;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}

/**
 * Marks an English sentence that is stored in a constant (a label map, a default prop) and translated
 * where it is shown: `const LABELS = { A: msg("Alpha") }` then `t(LABELS.A)`. It returns the text
 * unchanged; its only job is to let the coverage test find the sentence and require a translation.
 */
export function msg<T extends string>(text: T): T {
  return text;
}

/** The tag Intl uses for each language, so dates and numbers read naturally in it. */
export function localeTag(locale: Locale): string {
  return locale === "hi" ? "hi-IN" : "en-IN";
}
