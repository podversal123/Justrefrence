import type { Metadata } from "next";
import { Fraunces, Geist } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { QueryProvider } from "@/components/providers/query-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ToastProvider } from "@/components/ui/toast";
import { BRAND } from "@/lib/brand";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });
// Display face for headlines on the public portal: a soft serif gives the site an authoritative, editorial voice next to the neutral UI font.
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", display: "swap" });

export const metadata: Metadata = {
  title: {
    default: `${BRAND.name} — ${BRAND.tagline}`,
    template: "%s · Justreference",
  },
  description: BRAND.description,
  icons: {
    icon: "/brand/logo.jpg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={cn("font-sans", geist.variable, fraunces.variable)}>
      <body>
        <QueryProvider>
          <TooltipProvider>
            <ToastProvider>{children}</ToastProvider>
          </TooltipProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
