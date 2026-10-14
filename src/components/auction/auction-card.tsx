import { T } from "@/i18n/t-text";
import { msg } from "@/i18n/locales";
import { getT } from "@/i18n/server";
import Link from "next/link";
import type { Route } from "next";
import { Clock, Package, Store, Users } from "lucide-react";
import { Countdown } from "@/components/bidding/countdown";
import { AuctionStatusBadge } from "@/components/auction/badges";
import { formatAuctionNumber, hasEnded } from "@/server/domain/auction/rules";
import { formatPaise } from "@/lib/money";
import type { AuctionListRow } from "@/server/repositories/auction/auction-repository";

const KIND_LABEL: Record<string, string> = {
  PRODUCT: msg("Product"),
  SERVICE: msg("Service"),
  PROJECT: msg("Project"),
};

/** One row in an auctions list — shared by the public page, "my auctions", the vendor page and the admin list. */
export async function AuctionCard({
  auction,
  serverNow,
  href,
}: {
  auction: AuctionListRow;
  serverNow: Date;
  href: string;
}) {
  const t = await getT();
  const open = auction.status === "OPEN" && !hasEnded(auction, serverNow);
  // A deadline that has passed but not yet been saved still reads as ended.
  const status = auction.status === "OPEN" && !open ? "UNSOLD" : auction.status;
  const topUnit = auction.bids[0]?.unitPrice ?? null;
  const price = topUnit ?? auction.startPrice;
  return (
    <Link
      href={href as Route}
      className="hover:border-primary/40 hover:bg-accent focus-visible:ring-ring/50 block rounded-lg border p-4 outline-none focus-visible:ring-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-xs font-medium tabular-nums">
            {formatAuctionNumber(auction.auctionSeq)}
          </span>
          <AuctionStatusBadge status={open ? "OPEN" : status} />
        </div>
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <Clock className="text-muted-foreground size-4" aria-hidden="true" />
          {open ? (
            <Countdown
              closesAt={auction.closesAt.toISOString()}
              serverNow={serverNow.toISOString()}
            />
          ) : (
            <span className="text-muted-foreground">{t("Ended")}</span>
          )}
        </span>
      </div>

      <h3 className="mt-2 text-base font-semibold">{auction.title}</h3>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <dl className="text-muted-foreground flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <div className="flex items-center gap-1.5">
            <Package className="size-4" aria-hidden="true" />
            <dt className="sr-only">{t("Quantity")}</dt>
            <dd>
              {auction.quantity.toLocaleString("en-IN")} ·{" "}
              <T text={KIND_LABEL[auction.itemType] ?? auction.itemType} />
            </dd>
          </div>
          <div className="flex items-center gap-1.5">
            <Store className="size-4" aria-hidden="true" />
            <dt className="sr-only">{t("Seller")}</dt>
            <dd>{auction.vendor.businessName}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <Users className="size-4" aria-hidden="true" />
            <dt className="sr-only">{t("Bids")}</dt>
            <dd>
              {auction._count.bids === 1
                ? t("1 bid")
                : t("{count} bids", { count: auction._count.bids })}
            </dd>
          </div>
        </dl>
        <p className="text-right">
          <span className="text-muted-foreground block text-xs">
            {topUnit !== null ? t("Highest bid per unit") : t("Starting price per unit")}
          </span>
          <span className="text-lg font-semibold tabular-nums">
            {formatPaise(price.toString(), "INR")}
          </span>
        </p>
      </div>
    </Link>
  );
}
