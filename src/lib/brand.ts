/**
 * Single source for brand voice. The taglines below are the client's own
 * hero messages from the existing justreference.in site (supplied as
 * screenshots, 2026-09-22) — kept in one place so the header, hero,
 * footer, auth screens and page metadata can never drift apart. Light
 * copy-editing only (typos / missing articles); wording otherwise theirs.
 */
import { msg } from "@/i18n/locales";

export const BRAND = {
  name: "Justreference",
  domain: "justreference.in",
  headquarters: "New Delhi",
  /** The primary line — used wherever one tagline is shown. */
  tagline: msg("We help you start work with zero investment."),
  /** Its companion line from the same slide. */
  taglineSecondary: msg("We help you get what you want."),
  description: msg(
    "We help you start work with zero investment. Buy products, hire services and take on projects from approved vendors, and earn through referrals.",
  ),
} as const;

export type HeroIcon = "home" | "handshake" | "scale" | "target" | "store";

export interface HeroSlide {
  id: string;
  icon?: HeroIcon;
  headline: string;
  subline?: string;
  /** Full-bleed background photo: a file in /public/images/hero (Unsplash License, see docs/IMAGE_CREDITS.md) or a banner photo uploaded by staff. */
  image: string;
  cta: {
    label: string;
    /** A path on this site or an https link; validated where banners are saved (schemas/banner.ts). */
    href: string;
  };
}

/** The five slides of the client's current homepage banner, in order. */
export const HERO_SLIDES: readonly HeroSlide[] = [
  {
    id: "work-from-home",
    image: "/images/hero/slide-1.jpg",
    icon: "home",
    headline: msg("We help you start work without investment at home."),
    subline: msg("Get the solution of financial problems."),
    cta: { label: msg("Start earning"), href: "/referrals" },
  },
  {
    id: "zero-investment",
    image: "/images/hero/slide-2.jpg",
    icon: "handshake",
    headline: BRAND.tagline,
    subline: BRAND.taglineSecondary,
    cta: { label: msg("Create your account"), href: "/register" },
  },
  {
    id: "justice",
    image: "/images/hero/slide-3.jpg",
    icon: "scale",
    headline: msg("Justice for all."),
    subline: msg("Every buyer and vendor works under the same rules."),
    cta: { label: msg("Browse the marketplace"), href: "/products" },
  },
  {
    id: "right-place",
    image: "/images/hero/slide-4.jpg",
    icon: "target",
    headline: msg("We help you get the right one at the right place."),
    subline: msg("We work for all equality and opportunity."),
    cta: { label: msg("Explore services"), href: "/services" },
  },
  {
    id: "own-business",
    image: "/images/hero/slide-5.jpg",
    icon: "store",
    headline: msg("We help you start your own business."),
    subline: msg("We help you achieve your life goals."),
    cta: { label: msg("Become a vendor"), href: "/register" },
  },
] as const;
