import Link from "next/link";
import type { Route } from "next";
import type { LucideIcon } from "lucide-react";
import {
  ArrowUp,
  BadgeCheck,
  Clock,
  FileText,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { BRAND } from "@/lib/brand";
import { getSiteSettings } from "@/server/lib/site-settings";

/**
 * Dark, multi-column footer: who we are, how to reach us, and every top-level area, so nothing
 * needs a scroll back up. Contact details come from admin Settings (never typed into the code);
 * a detail the admin has not filled in is simply not shown. Links go only to pages that exist
 * and are open to everyone, never to a role-specific screen.
 */
const COLUMNS: { heading: string; links: { href: string; label: string }[] }[] = [
  {
    heading: "Marketplace",
    links: [
      { href: "/products", label: "Products" },
      { href: "/services", label: "Services" },
      { href: "/projects", label: "Projects" },
      { href: "/bids", label: "Bids and auctions" },
    ],
  },
  {
    heading: "Buyers",
    links: [
      { href: "/register", label: "Create an account" },
      { href: "/login", label: "Sign in" },
      { href: "/requirements/new", label: "Post a requirement" },
    ],
  },
  {
    heading: "Vendors and partners",
    links: [
      { href: "/register", label: "Become a vendor" },
      { href: "/bids", label: "Open bids to quote on" },
      { href: "/referrals", label: "Referral program" },
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

const TRUST_POINTS = [
  { icon: BadgeCheck, label: "Every vendor is approved before listing" },
  { icon: ShieldCheck, label: "Payments are confirmed with the payment provider" },
  { icon: FileText, label: "A GST invoice for every order" },
];

interface ContactRow {
  icon: LucideIcon;
  text: string;
  href?: string;
}

export async function PortalFooter() {
  const settings = await getSiteSettings();
  const contact: ContactRow[] = [];
  if (settings.contactEmail) {
    contact.push({
      icon: Mail,
      text: settings.contactEmail,
      href: `mailto:${settings.contactEmail}`,
    });
  }
  if (settings.contactPhone) {
    contact.push({
      icon: Phone,
      text: settings.contactPhone,
      href: `tel:${settings.contactPhone.replace(/[^0-9+]/g, "")}`,
    });
  }
  if (settings.contactAddress) contact.push({ icon: MapPin, text: settings.contactAddress });
  if (settings.contactHours) contact.push({ icon: Clock, text: settings.contactHours });

  return (
    <footer className="bg-ink text-ink-foreground relative isolate overflow-hidden">
      <div
        aria-hidden="true"
        className="bg-primary/20 absolute -bottom-40 -left-24 -z-10 size-[28rem] rounded-full blur-3xl"
      />

      <div className="mx-auto w-full max-w-7xl px-4 pt-14 pb-8">
        <ul className="grid gap-3 border-b border-white/10 pb-8 sm:grid-cols-3">
          {TRUST_POINTS.map(({ icon: Icon, label }) => (
            <li key={label} className="text-ink-foreground/80 flex items-center gap-3 text-sm">
              <span className="bg-marigold/15 text-marigold flex size-9 shrink-0 items-center justify-center rounded-full">
                <Icon className="size-4" aria-hidden="true" />
              </span>
              {label}
            </li>
          ))}
        </ul>

        <div className="grid gap-12 py-12 lg:grid-cols-[1.2fr_2fr]">
          <div className="space-y-6">
            <Logo size={36} withWordmark className="[&_span]:text-ink-foreground" />
            <p className="max-w-sm text-2xl leading-snug font-bold tracking-tight">
              {BRAND.tagline}
            </p>
            <p className="text-ink-foreground/70 max-w-sm text-sm leading-relaxed">
              {BRAND.name} brings buyers and approved vendors together, and rewards the people who
              introduce them.
            </p>

            {contact.length > 0 ? (
              <ul className="space-y-2.5 text-sm">
                {contact.map(({ icon: Icon, text, href }) => (
                  <li key={text} className="text-ink-foreground/80 flex items-start gap-3">
                    <Icon className="text-marigold mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    {href ? (
                      <a href={href} className="hover:text-ink-foreground transition-colors">
                        {text}
                      </a>
                    ) : (
                      <span>{text}</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <Link
                href={"/contact" as Route}
                className="text-marigold inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
              >
                Talk to our team
              </Link>
            )}
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

        <div className="text-ink-foreground/60 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-6 text-xs">
          <p>
            © {new Date().getFullYear()} {BRAND.name}. All rights reserved.
          </p>
          <a
            href="#"
            className="hover:text-ink-foreground inline-flex items-center gap-1.5 transition-colors"
          >
            Back to top
            <ArrowUp className="size-3.5" aria-hidden="true" />
          </a>
        </div>
      </div>
    </footer>
  );
}
