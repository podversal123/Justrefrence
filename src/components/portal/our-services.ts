import { msg } from "@/i18n/locales";

/** The "Our Services" dropdown: each entry is a page at /our-services/<slug>. */
export const OUR_SERVICES = [
  { slug: "entrepreneurship-services", label: msg("Entrepreneurship Services") },
  { slug: "financial-services", label: msg("Financial Services") },
  { slug: "human-resource", label: msg("Human Resource") },
  { slug: "it-services", label: msg("IT Services") },
  { slug: "telecom-services", label: msg("Telecom Services") },
  { slug: "tour-and-travels", label: msg("Tour & Travels") },
  { slug: "ngos-services", label: msg("NGOs Services") },
  { slug: "legal-services", label: msg("Legal Services") },
  { slug: "general-services", label: msg("General Services") },
] as const;
