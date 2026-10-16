import Link from "next/link";
import type { Route } from "next";
import type { LucideIcon } from "lucide-react";
import {
  BadgeCheck,
  ClipboardCheck,
  FileCheck2,
  Headset,
  Megaphone,
  PiggyBank,
  Store,
} from "lucide-react";
import { getT } from "@/i18n/server";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";
import { getCatalogRepository } from "@/server/repositories/catalog/registry";
import {
  getPendingPayouts,
  getVendorCounts,
} from "@/server/repositories/dashboard/dashboard-repository";
import { countChangesByStatus } from "@/server/repositories/approvals/change-repository";
import { countDocumentsByStatus } from "@/server/repositories/kyc/kyc-repository";
import { countTicketsByStatus } from "@/server/repositories/support/ticket-repository";
import { countPendingAds } from "@/server/repositories/ads/ad-repository";

interface Tile {
  key: string;
  icon: LucideIcon;
  label: string;
  count: number;
  note?: string;
  href: Route;
}

/** One failed count never hides the others: it just reads as zero. */
async function safely<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}

/**
 * What is waiting for a decision right now, as live counts that each lead straight to the place where
 * it is dealt with. Every number comes from the database; nothing is typed in.
 */
export async function NeedsAttention() {
  const t = await getT();

  const [vendors, products, services, projects, changes, payouts, kyc, tickets, ads] =
    await Promise.all([
      safely(getVendorCounts(), { total: 0, approved: 0, pending: 0 }),
      safely(getCatalogRepository("PRODUCT").count({ approvalStatus: "PENDING" }), 0),
      safely(getCatalogRepository("SERVICE").count({ approvalStatus: "PENDING" }), 0),
      safely(getCatalogRepository("PROJECT").count({ approvalStatus: "PENDING" }), 0),
      safely(countChangesByStatus(), {} as Awaited<ReturnType<typeof countChangesByStatus>>),
      safely(getPendingPayouts(), { count: 0, amount: 0n }),
      safely(countDocumentsByStatus(), {} as Awaited<ReturnType<typeof countDocumentsByStatus>>),
      safely(countTicketsByStatus(), {} as Awaited<ReturnType<typeof countTicketsByStatus>>),
      safely(countPendingAds(), 0),
    ]);

  // The listing queue opens on the type that has the most waiting.
  const listingsByKind = [
    { kind: "products", count: products },
    { kind: "services", count: services },
    { kind: "projects", count: projects },
  ].sort((a, b) => b.count - a.count);
  const listingCount = products + services + projects;

  const tiles: Tile[] = [
    {
      key: "sellers",
      icon: Store,
      label: t("Seller requests"),
      count: vendors.pending,
      href: "/admin/vendors?status=PENDING" as Route,
    },
    {
      key: "listings",
      icon: ClipboardCheck,
      label: t("Listings to approve"),
      count: listingCount,
      href: `/admin/catalog/${listingsByKind[0]?.kind ?? "products"}?approvalStatus=PENDING` as Route,
    },
    {
      key: "changes",
      icon: BadgeCheck,
      label: t("Changes to approve"),
      count: changes.PENDING ?? 0,
      href: "/admin/approvals" as Route,
    },
    {
      key: "payouts",
      icon: PiggyBank,
      label: t("Payout requests"),
      count: payouts.count,
      note: payouts.count > 0 ? formatPaise(payouts.amount.toString()) : undefined,
      href: "/admin/payouts" as Route,
    },
    {
      key: "kyc",
      icon: FileCheck2,
      label: t("Documents to check"),
      count: kyc.PENDING ?? 0,
      href: "/admin/kyc" as Route,
    },
    {
      key: "tickets",
      icon: Headset,
      label: t("Open support tickets"),
      count: (tickets.OPEN ?? 0) + (tickets.IN_PROGRESS ?? 0),
      href: "/admin/support" as Route,
    },
    {
      key: "ads",
      icon: Megaphone,
      label: t("Ads to approve"),
      count: ads,
      href: "/admin/ads" as Route,
    },
  ];

  const total = tiles.reduce((sum, tile) => sum + tile.count, 0);

  return (
    <section className="flex flex-col gap-3" aria-labelledby="needs-attention-title">
      <div>
        <h2 id="needs-attention-title" className="text-lg font-semibold">
          {t("Waiting for you")}
        </h2>
        <p className="text-muted-foreground text-sm">
          {total === 0
            ? t("Nothing is waiting for a decision. You are all caught up.")
            : t("These are waiting for a decision. Open one to deal with it.")}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {tiles.map((tile) => (
          <Link
            key={tile.key}
            href={tile.href}
            className={cn(
              "focus-visible:ring-ring/50 flex min-h-24 flex-col justify-between gap-2 rounded-xl border p-4 transition-colors outline-none focus-visible:ring-3",
              tile.count > 0
                ? "bg-card hover:bg-muted border-primary/30"
                : "bg-card/60 hover:bg-muted text-muted-foreground",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium">{tile.label}</span>
              <tile.icon className="size-4 shrink-0" aria-hidden="true" />
            </div>
            <div>
              <span
                className={cn(
                  "text-2xl font-semibold tracking-tight tabular-nums",
                  tile.count > 0 && "text-foreground",
                )}
              >
                {tile.count.toLocaleString()}
              </span>
              {tile.note ? (
                <span className="text-muted-foreground ml-2 text-xs">{tile.note}</span>
              ) : null}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
