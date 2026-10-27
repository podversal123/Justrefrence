import type { Metadata } from "next";
import { Noto_Sans_Devanagari } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { QueryProvider } from "@/components/providers/query-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ToastProvider } from "@/components/ui/toast";
import { FormValueKeeper } from "@/components/providers/form-value-keeper";
import { BRAND } from "@/lib/brand";
import { LocaleProvider } from "@/i18n/provider";
import { getLocale, messagesFor } from "@/i18n/server";

// Roboto has no Devanagari letters. This family fills in only for Hindi text (the browser fetches
// its file only when a Hindi character is on the page), so English pages pay nothing for it.
const notoDevanagari = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  variable: "--font-devanagari",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: {
    default: `${BRAND.name}: ${BRAND.tagline}`,
    template: "%s · Justreference",
  },
  description: BRAND.description,
  icons: {
    icon: "/brand/logo.jpg",
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={cn("font-sans", notoDevanagari.variable)}
    >
      <body>
        <FormValueKeeper />
        <LocaleProvider locale={locale} messages={messagesFor(locale)}>
          <QueryProvider>
            <TooltipProvider>
              <ToastProvider>{children}</ToastProvider>
            </TooltipProvider>
          </QueryProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
