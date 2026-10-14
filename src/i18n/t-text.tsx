"use client";

import { useT } from "@/i18n/provider";
import type { TranslateVars } from "@/i18n/locales";

/**
 * Translated text for components shared by Server and Client Components, which can use neither
 * getT() nor a hook of their own. It is a tiny client component, so it works anywhere and only
 * takes a plain string (the English sentence) as its prop.
 */
export function T({ text, vars }: { text: string; vars?: TranslateVars }) {
  const t = useT();
  return <>{t(text, vars)}</>;
}
