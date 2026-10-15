"use client";

import { useT } from "@/i18n/provider";
import { msg } from "@/i18n/locales";
import { Fragment } from "react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { NAV_GROUPS } from "@/components/layout/nav-config";

/*
 * Derives a breadcrumb trail from the URL alone, so every dashboard screen
 * gets breadcrumbs for free (Phase 10 brief) without prop-drilling a title
 * through every page.tsx. Only segments that are known, real destinations
 * (NAV_GROUPS hrefs, or "/dashboard") render as links — organizational
 * segments like "admin"/"vendor"/"catalog" that have no page of their own
 * render as plain text so the trail never contains a dead link.
 */

const KNOWN_HREFS = new Set<string>(["/dashboard"]);
for (const group of NAV_GROUPS) {
  for (const item of group.items) KNOWN_HREFS.add(item.href);
}

const SEGMENT_LABELS: Record<string, string> = {
  dashboard: msg("Dashboard"),
  profile: msg("Profile"),
  cart: msg("Cart"),
  checkout: msg("Checkout"),
  pay: msg("Payment"),
  orders: msg("Orders"),
  referrals: msg("Referrals"),
  "audit-log": msg("Audit log"),
  vendor: msg("Vendor"),
  admin: msg("Admin"),
  admins: msg("Admins"),
  vendors: msg("Vendors"),
  roles: msg("Roles & permissions"),
  "commission-rules": msg("Commission rules"),
  wallet: msg("Wallet"),
  wallets: msg("Wallets"),
  subscription: msg("Subscription"),
  "subscription-plans": msg("Subscription plans"),
  payouts: msg("Payouts"),
  epins: msg("E-pins"),
  catalog: msg("Catalog"),
  products: msg("Products"),
  services: msg("Services"),
  projects: msg("Projects"),
  categories: msg("Categories"),
  new: msg("New"),
  members: msg("Members"),
  tds: msg("TDS list"),
  sms: msg("SMS"),
  ads: msg("Advertisements"),
  rewards: msg("Rewards"),
  auctions: msg("Auctions"),
  "my-auctions": msg("Auction bids"),
  kyc: msg("KYC review"),
  approvals: msg("Approvals"),
  announcements: msg("Announcements"),
  banners: msg("Banners"),
  bids: msg("Bids"),
  "my-bids": msg("Bids"),
  requirements: msg("Requirements"),
  messages: msg("Messages"),
  support: msg("Support"),
  coupons: msg("Coupons"),
  invoices: msg("Invoices"),
  blog: msg("Blog"),
  feedback: msg("Feedback"),
  settings: msg("Settings"),
  epin: msg("E-pin"),
};

function isIdLike(segment: string): boolean {
  return /^[0-9a-f-]{8,}$/i.test(segment) || /^\d+$/.test(segment);
}

function humanize(segment: string): string {
  return segment.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

interface Crumb {
  label: string;
  href?: Route;
}

export function AutoBreadcrumbs() {
  const t = useT();
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  const crumbs: Crumb[] = [{ label: msg("Dashboard"), href: "/dashboard" as Route }];
  let acc = "";
  for (const segment of segments) {
    acc += `/${segment}`;
    if (acc === "/dashboard") continue;
    const label =
      SEGMENT_LABELS[segment] ?? (isIdLike(segment) ? msg("Details") : humanize(segment));
    crumbs.push({ label, href: KNOWN_HREFS.has(acc) ? (acc as Route) : undefined });
  }

  if (crumbs.length === 1) {
    crumbs[0] = { label: crumbs[0]!.label };
  }

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap overflow-hidden">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <Fragment key={`${t(crumb.label)}-${index}`}>
              <BreadcrumbItem className={isLast ? "min-w-0 truncate" : "shrink-0"}>
                {isLast ? (
                  <BreadcrumbPage className="truncate">{t(crumb.label)}</BreadcrumbPage>
                ) : crumb.href ? (
                  <BreadcrumbLink render={<Link href={crumb.href}>{t(crumb.label)}</Link>} />
                ) : (
                  <span className="truncate">{t(crumb.label)}</span>
                )}
              </BreadcrumbItem>
              {!isLast && <BreadcrumbSeparator />}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
