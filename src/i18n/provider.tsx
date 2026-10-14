"use client";

import { formatDate, formatDateTime } from "@/lib/format";
import { createContext, useCallback, useContext, useMemo } from "react";
import {
  DEFAULT_LOCALE,
  translate,
  type Locale,
  type Messages,
  type TranslateVars,
} from "@/i18n/locales";

interface LocaleContextValue {
  locale: Locale;
  messages: Messages;
}

const LocaleContext = createContext<LocaleContextValue>({ locale: DEFAULT_LOCALE, messages: {} });

/** Gives Client Components the language and its translations. Set once, in the root layout. */
export function LocaleProvider({
  locale,
  messages,
  children,
}: {
  locale: Locale;
  messages: Messages;
  children: React.ReactNode;
}) {
  const value = useMemo(() => ({ locale, messages }), [locale, messages]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext).locale;
}

/** `const t = useT();` then `t("My orders")`. For Client Components. */
export function useT() {
  const { messages } = useContext(LocaleContext);
  return useCallback(
    (text: string, vars?: TranslateVars) => translate(messages, text, vars),
    [messages],
  );
}

export function useFormat() {
  const locale = useLocale();
  return useMemo(
    () => ({
      formatDate: (value: Date | string) => formatDate(value, locale),
      formatDateTime: (value: Date | string) => formatDateTime(value, locale),
    }),
    [locale],
  );
}
