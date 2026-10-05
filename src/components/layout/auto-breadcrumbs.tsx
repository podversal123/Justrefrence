"use client";

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
  dashboard: "Dashboard",
  profile: "Profile",
  cart: "Cart",
  checkout: "Checkout",
  pay: "Payment",
  orders: "Orders",
  referrals: "Referrals",
  "audit-log": "Audit log",
  vendor: "Vendor",
  admin: "Admin",
  admins: "Admins",
  vendors: "Vendors",
  roles: "Roles & permissions",
  "commission-rules": "Commission rules",
  wallet: "Wallet",
  wallets: "Wallets",
  subscription: "Subscription",
  "subscription-plans": "Subscription plans",
  payouts: "Payouts",
  epins: "E-pins",
  catalog: "Catalog",
  products: "Products",
  services: "Services",
  projects: "Projects",
  categories: "Categories",
  new: "New",
};

function isIdLike(segment: string): boolean {
  return /^[0-9a-f-]{8,}$/i.test(segment) || /^\d+$/.test(segment);
}

function humanize(segment: string): string {
  return segment
    .replace(/-/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

interface Crumb {
  label: string;
  href?: Route;
}

export function AutoBreadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  const crumbs: Crumb[] = [{ label: "Dashboard", href: "/dashboard" as Route }];
  let acc = "";
  for (const segment of segments) {
    acc += `/${segment}`;
    if (acc === "/dashboard") continue;
    const label = SEGMENT_LABELS[segment] ?? (isIdLike(segment) ? "Details" : humanize(segment));
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
            <Fragment key={`${crumb.label}-${index}`}>
              <BreadcrumbItem className={isLast ? "min-w-0 truncate" : "shrink-0"}>
                {isLast ? (
                  <BreadcrumbPage className="truncate">{crumb.label}</BreadcrumbPage>
                ) : crumb.href ? (
                  <BreadcrumbLink render={<Link href={crumb.href}>{crumb.label}</Link>} />
                ) : (
                  <span className="truncate">{crumb.label}</span>
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
