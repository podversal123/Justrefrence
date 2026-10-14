"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Languages } from "lucide-react";
import { LOCALES, LOCALE_LABEL, type Locale } from "@/i18n/locales";
import { useLocale, useT } from "@/i18n/provider";
import { setLocaleAction } from "@/server/services/locale-actions";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

/**
 * English / हिन्दी switch. Each language is written in its own script, and the current one is marked,
 * so a visitor can always find the way back.
 */
export function LanguageSwitch({
  className,
  onDark = false,
}: {
  className?: string;
  onDark?: boolean;
}) {
  const router = useRouter();
  const t = useT();
  const current = useLocale();
  const [pending, start] = useTransition();

  function choose(locale: Locale) {
    if (locale === current || pending) return;
    start(async () => {
      const result = await setLocaleAction(locale);
      if (!result.success) toast.error(result.error.message);
      else router.refresh();
    });
  }

  return (
    <div
      role="group"
      aria-label={t("Language")}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border p-0.5 text-xs",
        onDark ? "border-primary-foreground/30" : "border-border",
        className,
      )}
    >
      <Languages className="ml-1.5 size-3.5 shrink-0 opacity-70" aria-hidden="true" />
      {LOCALES.map((locale) => (
        <button
          key={locale}
          type="button"
          lang={locale}
          aria-pressed={locale === current}
          disabled={pending}
          onClick={() => choose(locale)}
          className={cn(
            "rounded-full px-2.5 py-1 font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
            locale === current
              ? onDark
                ? "bg-primary-foreground text-primary"
                : "bg-primary text-primary-foreground"
              : "opacity-80 hover:opacity-100",
          )}
        >
          {LOCALE_LABEL[locale]}
        </button>
      ))}
    </div>
  );
}
