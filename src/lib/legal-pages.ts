import { msg } from "@/i18n/locales";

/**
 * The three legal pages (Terms and Conditions, Privacy Policy, Refund Policy). Their wording is never
 * written in the code: it is the client's lawyer's text, pasted by an admin in Admin > Legal pages and
 * stored in system_settings. Until a page has text, it is not linked and its address says so.
 * Pure, no I/O, so the browser and the server can both use it.
 */

export const LEGAL_PAGES = [
  { slug: "terms", path: "/terms", title: msg("Terms and Conditions") },
  { slug: "privacy", path: "/privacy", title: msg("Privacy Policy") },
  { slug: "refund-policy", path: "/refund-policy", title: msg("Refund Policy") },
] as const;

export type LegalSlug = (typeof LEGAL_PAGES)[number]["slug"];

export const MAX_LEGAL_LENGTH = 60_000;

export function isLegalSlug(value: string): value is LegalSlug {
  return LEGAL_PAGES.some((page) => page.slug === value);
}

/**
 * Plain text in, paragraphs out. A blank line starts a new paragraph; single line breaks stay inside
 * one paragraph. Nothing is treated as HTML, so pasted text can never inject markup.
 */
export function splitParagraphs(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
}
