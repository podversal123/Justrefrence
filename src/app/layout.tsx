import type { Metadata } from "next";
import { Public_Sans } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { QueryProvider } from "@/components/providers/query-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ToastProvider } from "@/components/ui/toast";
import { FormValueKeeper } from "@/components/providers/form-value-keeper";
import { BRAND } from "@/lib/brand";

// One family for the whole product: clean, highly legible at small sizes in tables and forms, and
// strong in bold for headlines. "latin-ext" matters: the rupee sign (U+20B9) lives in that subset,
// so without it every price would silently fall back to a system font.
const publicSans = Public_Sans({
  subsets: ["latin", "latin-ext"],
  variable: "--font-sans",
  display: "swap",
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={cn("font-sans", publicSans.variable)}>
      <body>
        <FormValueKeeper />
        <QueryProvider>
          <TooltipProvider>
            <ToastProvider>{children}</ToastProvider>
          </TooltipProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
