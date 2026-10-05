import Link from "next/link";
import type { Route } from "next";
import { ArrowRight } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { BRAND } from "@/lib/brand";

/**
 * Dark, multi-column footer (portal convention: every top-level area is
 * reachable without scrolling back up). Only links to routes that exist.
 */
const COLUMNS: { heading: string; links: { href: string; label: string }[] }[] = [
  {
    heading: "Marketplace",
    links: [
      { href: "/products", label: "Products" },
      { href: "/services", label: "Services" },
      { href: "/projects", label: "Projects" },
      { href: "/bids", label: "Bids and auctions" },
      { href: "/cart", label: "Your cart" },
    ],
  },
  {
    heading: "Buyers",
    links: [
      { href: "/register", label: "Create an account" },
      { href: "/login", label: "Sign in" },
      { href: "/orders", label: "Track your orders" },
      { href: "/requirements/new", label: "Post a requirement" },
    ],
  },
  {
    heading: "Vendors and partners",
    links: [
      { href: "/register", label: "Become a vendor" },
      { href: "/my-bids", label: "Your bids" },
      { href: "/referrals", label: "Referral program" },
      { href: "/wallet", label: "Wallet and payouts" },
    ],
  },
  {
    heading: "Company",
    links: [
      { href: "/about", label: "About us" },
      { href: "/contact", label: "Contact us" },
      { href: "/blog", label: "News and updates" },
      { href: "/feedback", label: "Feedback" },
    ],
  },
];

export function PortalFooter() {
  return (
    <footer className="bg-ink text-ink-foreground bg-dots relative isolate overflow-hidden">
      <div
        aria-hidden="true"
        className="bg-primary/20 absolute -bottom-40 -left-24 -z-10 size-[28rem] rounded-full blur-3xl"
      />

      <div className="mx-auto w-full max-w-7xl px-4 pt-16 pb-10">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_2fr]">
          <div className="space-y-5">
            <Logo size={36} withWordmark className="[&_span]:text-ink-foreground" />
            <p className="font-display max-w-sm text-2xl leading-snug font-semibold">
              {BRAND.tagline}
            </p>
            <p className="text-ink-foreground/70 max-w-sm text-sm leading-relaxed">
              {BRAND.taglineSecondary} {BRAND.domain} is headquartered in {BRAND.headquarters}: a
              multi-vendor marketplace where every seller is reviewed before they list, payments are
              verified on the server, and introductions earn a referral reward.
            </p>
            <Link
              href={"/contact" as Route}
              className="text-marigold inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
            >
              Talk to our team
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {COLUMNS.map((column) => (
              <nav key={column.heading} aria-label={column.heading} className="space-y-4">
                <p className="text-sm font-semibold">{column.heading}</p>
                <ul className="text-ink-foreground/70 space-y-2.5 text-sm">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href as Route}
                        className="hover:text-ink-foreground transition-colors"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        <div className="text-ink-foreground/60 mt-14 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-6 text-xs">
          <p>
            © {new Date().getFullYear()} {BRAND.name}. All rights reserved.
          </p>
          <p>Approved vendors · Verified payments · GST invoices</p>
        </div>
      </div>
    </footer>
  );
}
