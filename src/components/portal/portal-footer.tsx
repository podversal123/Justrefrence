import { msg } from "@/i18n/locales";
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
import { getLegalTexts } from "@/server/lib/legal-store";
import { LEGAL_PAGES, splitParagraphs } from "@/lib/legal-pages";
import { getT } from "@/i18n/server";

/**
 * Dark, multi-column footer: who we are, how to reach us, and every top-level area, so nothing
 * needs a scroll back up. Contact details come from admin Settings (never typed into the code);
 * a detail the admin has not filled in is simply not shown. Links go only to pages that exist
 * and are open to everyone, never to a role-specific screen.
 */
const COLUMNS: { heading: string; links: { href: string; label: string }[] }[] = [
  {
    heading: msg("Marketplace"),
    links: [
      { href: "/products", label: msg("Products") },
      { href: "/services", label: msg("Services") },
      { href: "/projects", label: msg("Projects") },
      { href: "/bids", label: msg("Bids and tenders") },
      { href: "/auctions", label: msg("Auctions") },
    ],
  },
  {
    heading: msg("Buyers"),
    links: [
      { href: "/register", label: msg("Create an account") },
      { href: "/login", label: msg("Sign in") },
      { href: "/requirements/new", label: msg("Post a requirement") },
    ],
  },
  {
    heading: msg("Vendors and partners"),
    links: [
      { href: "/become-seller", label: msg("Become a vendor") },
      { href: "/bids", label: msg("Open bids to quote on") },
      { href: "/referrals", label: msg("Referral program") },
    ],
  },
  {
    heading: msg("Company"),
    links: [
      { href: "/blog", label: msg("News and updates") },
      { href: "/feedback", label: msg("Feedback") },
    ],
  },
];

const TRUST_POINTS = [
  { icon: BadgeCheck, label: msg("Every vendor is approved before listing") },
  { icon: ShieldCheck, label: msg("Payments are confirmed with the payment provider") },
  { icon: FileText, label: msg("A GST invoice for every order") },
];

interface ContactRow {
  icon: LucideIcon;
  text: string;
  href?: string;
}

export async function PortalFooter() {
  const t = await getT();
  const [settings, legalTexts] = await Promise.all([getSiteSettings(), getLegalTexts()]);
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
    <footer className="bg-ink text-ink-foreground">
      <div className="mx-auto w-full max-w-7xl px-4 pt-8 pb-6">
        <ul className="grid gap-3 border-b border-white/15 pb-6 sm:grid-cols-3">
          {TRUST_POINTS.map(({ icon: Icon, label }) => (
            <li key={label} className="text-ink-foreground/80 flex items-center gap-3 text-sm">
              <Icon className="size-5 shrink-0" aria-hidden="true" />
              {t(label)}
            </li>
          ))}
        </ul>

        <div className="grid gap-10 py-8 lg:grid-cols-[1.2fr_2fr]">
          <div className="space-y-4">
            <Logo size={36} withWordmark onDark />
            <p className="max-w-sm text-lg leading-snug font-medium">{t(BRAND.tagline)}</p>
            <p className="text-ink-foreground/70 max-w-sm text-sm leading-relaxed">
              {t(
                "{name} brings buyers and approved vendors together, and rewards the people who introduce them.",
                { name: BRAND.name },
              )}
            </p>

            {contact.length > 0 ? (
              <ul className="space-y-2.5 text-sm">
                {contact.map(({ icon: Icon, text, href }) => (
                  <li key={text} className="text-ink-foreground/80 flex items-start gap-3">
                    <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
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
                className="inline-flex items-center gap-1.5 text-sm underline underline-offset-4 hover:no-underline"
              >
                {t("Talk to our team")}
              </Link>
            )}
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {COLUMNS.map((column) => (
              <nav key={column.heading} aria-label={t(column.heading)} className="space-y-3">
                <p className="border-b border-white/15 pb-2 text-sm font-medium">
                  {t(column.heading)}
                </p>
                <ul className="text-ink-foreground/70 space-y-2.5 text-sm">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href as Route}
                        className="hover:text-ink-foreground transition-colors"
                      >
                        {t(link.label)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        <div className="text-ink-foreground/70 flex flex-wrap items-center justify-between gap-3 border-t border-white/15 pt-4 text-xs">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <p>
              {t("© {year} {name}. All rights reserved.", {
                year: new Date().getFullYear(),
                name: BRAND.name,
              })}
            </p>
            {LEGAL_PAGES.filter((page) => splitParagraphs(legalTexts[page.slug]).length > 0).map(
              (page) => (
                <Link
                  key={page.slug}
                  href={page.path as Route}
                  className="hover:text-ink-foreground transition-colors"
                >
                  {t(page.title)}
                </Link>
              ),
            )}
          </div>
          <a
            href="#"
            className="hover:text-ink-foreground inline-flex items-center gap-1.5 transition-colors"
          >
            {t("Back to top")}
            <ArrowUp className="size-3.5" aria-hidden="true" />
          </a>
        </div>
      </div>
    </footer>
  );
}
