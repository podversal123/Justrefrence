import { bidderLabelText } from "@/lib/bidder-label";
import { T } from "@/i18n/t-text";
import { msg } from "@/i18n/locales";
import { getFormat, getT } from "@/i18n/server";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { CalendarClock, Gavel, Package, Store, TrendingUp, Wallet } from "lucide-react";
import { AuctionLive } from "@/components/auction/auction-live";
import { CancelAuctionButton, PayForAuctionForm } from "@/components/auction/auction-buttons";
import { AuctionStatusBadge } from "@/components/auction/badges";
import { buttonVariants } from "@/components/ui/button";
import { getAuthSession } from "@/server/auth/session";
import { auctionViewerFromSession, loadAuctionView } from "@/server/domain/auction/load-view";
import { formatAuctionNumber } from "@/server/domain/auction/rules";
import { toAuctionSnapshot } from "@/server/domain/auction/view";
import {
  getAuctionById,
  getAuctionOrderStatus,
} from "@/server/repositories/auction/auction-repository";
import { formatPaise } from "@/lib/money";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const t = await getT();
  if (!z.string().uuid().safeParse(id).success) return { title: t("Auction not found") };
  const auction = await getAuctionById(id).catch(() => null);
  if (!auction) return { title: t("Auction not found") };
  return { title: `${formatAuctionNumber(auction.auctionSeq)}: ${auction.title}` };
}

const KIND_LABEL: Record<string, string> = {
  PRODUCT: msg("Product"),
  SERVICE: msg("Service"),
  PROJECT: msg("Project"),
};

function Fact({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Package;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-md">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="text-sm">
        <dt className="text-muted-foreground text-xs">{label}</dt>
        <dd className="font-medium">{children}</dd>
      </div>
    </div>
  );
}

export default async function AuctionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const { formatDateTime } = await getFormat();
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();

  const session = await getAuthSession();
  const loaded = await loadAuctionView(id, auctionViewerFromSession(session));
  if (!loaded) notFound();
  const { auction, view, now } = loaded;

  const number = formatAuctionNumber(auction.auctionSeq);
  const open = view.status === "OPEN";
  const canBid = Boolean(
    session && session.permissions.has("auction:bid") && session.hasMemberProfile && !view.isSeller,
  );
  const snapshot = toAuctionSnapshot(auction, view, now);
  const paid = auction.checkoutId !== null;
  // A winner who left before paying comes back to the same payment screen.
  const order =
    (view.isWinner || view.isSeller) && auction.checkoutId
      ? await getAuctionOrderStatus(auction.checkoutId)
      : null;
  const awaitingPayment = order?.status === "PLACED";

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <nav aria-label={t("Breadcrumb")} className="text-muted-foreground mb-4 text-xs">
        <Link href="/" className="hover:text-foreground">
          {t("Home")}
        </Link>{" "}
        /{" "}
        <Link href={"/auctions" as Route} className="hover:text-foreground">
          {t("Auctions")}
        </Link>{" "}
        / <span aria-current="page">{number}</span>
      </nav>

      <div className="mb-6 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-sm font-medium tabular-nums">{number}</span>
          <AuctionStatusBadge status={view.status} />
        </div>
        <h1>{auction.title}</h1>
        <p className="text-muted-foreground text-sm">
          {t("Started {date} by {vendor}", {
            date: formatDateTime(auction.createdAt),
            vendor: auction.vendor.businessName,
          })}
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-8">
          {auction.description ? (
            <section aria-labelledby="auc-details" className="space-y-3">
              <h2 id="auc-details" className="text-lg">
                {t("About this auction")}
              </h2>
              <p className="whitespace-pre-wrap">{auction.description}</p>
            </section>
          ) : null}

          <section aria-labelledby="auc-facts" className="space-y-3">
            <h2 id="auc-facts" className="text-lg">
              {t("Key details")}
            </h2>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Fact icon={Package} label={t("Quantity")}>
                {auction.quantity.toLocaleString("en-IN")} ·{" "}
                <T text={KIND_LABEL[auction.itemType] ?? auction.itemType} />
              </Fact>
              <Fact icon={Store} label={t("Seller")}>
                {auction.vendor.businessName}
              </Fact>
              <Fact icon={Wallet} label={t("Starting price per unit")}>
                {formatPaise(auction.startPrice.toString(), "INR")}
              </Fact>
              <Fact icon={TrendingUp} label={t("Each new bid must be higher by")}>
                {auction.minIncrement > 0n
                  ? t("at least {amount}", {
                      amount: formatPaise(auction.minIncrement.toString(), "INR"),
                    })
                  : t("any amount")}
              </Fact>
              <Fact icon={CalendarClock} label={open ? t("Bidding closes") : t("Bidding closed")}>
                {t("{date} IST", { date: formatDateTime(auction.closesAt) })}
              </Fact>
              {auction.autoExtendMinutes > 0 ? (
                <Fact icon={Gavel} label={t("Last-minute bids")}>
                  {t("A bid in the last {minutes} minutes extends bidding by {minutes} minutes.", {
                    minutes: auction.autoExtendMinutes,
                  })}
                </Fact>
              ) : null}
              {view.reservePrice !== null ? (
                <Fact
                  icon={Wallet}
                  label={
                    view.isSeller
                      ? t("Your lowest accepted price (only you see this)")
                      : t("Seller's lowest accepted price (hidden from bidders)")
                  }
                >
                  {t("{amount} per unit", {
                    amount: formatPaise(view.reservePrice.toString(), "INR"),
                  })}
                </Fact>
              ) : null}
            </dl>
          </section>

          {auction.status === "CANCELLED" && auction.cancelledReason ? (
            <p className="border-destructive/30 bg-destructive/5 rounded-lg border p-4 text-sm">
              <span className="font-medium">{t("Cancelled:")}</span> {auction.cancelledReason}
            </p>
          ) : null}

          <section aria-labelledby="auc-history" className="space-y-3">
            <h2 id="auc-history" className="text-lg">
              {t("Bid history")}
            </h2>
            {view.bids.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t("No bids yet. Be the first.")}</p>
            ) : (
              <ul className="divide-y rounded-lg border text-sm">
                {view.bids.map((bid, index) => (
                  <li
                    key={`${bid.createdAt.toISOString()}-${index}`}
                    className="flex items-center justify-between gap-3 px-4 py-2.5"
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-medium">{bidderLabelText(bid.bidderLabel, t)}</span>
                      {bid.isMine ? (
                        <span className="text-muted-foreground text-xs">{t("(you)")}</span>
                      ) : null}
                      <span className="text-muted-foreground text-xs">
                        {formatDateTime(bid.createdAt)}
                      </span>
                    </span>
                    <span className="font-semibold tabular-nums">
                      {formatPaise(bid.unitPrice.toString(), "INR")}
                      <span className="text-muted-foreground text-xs font-normal">
                        {t("/ unit")}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="space-y-4" aria-label={t("Bidding")}>
          <AuctionLive
            auctionId={auction.id}
            quantity={auction.quantity}
            initial={snapshot}
            canBid={canBid}
          />

          {view.isWinner ? (
            paid ? (
              <div className="space-y-3 rounded-lg border p-5 text-sm">
                <p className="font-medium">{t("You won this auction.")}</p>
                <p className="text-muted-foreground">
                  {awaitingPayment
                    ? t("Your order is placed. Complete the payment to confirm it.")
                    : t("Your order has been placed.")}
                </p>
                <Link
                  href={
                    (awaitingPayment
                      ? `/checkout/pay?checkoutId=${auction.checkoutId}`
                      : "/orders") as Route
                  }
                  className={buttonVariants({ size: "touch", className: "w-full" })}
                >
                  {awaitingPayment ? t("Complete payment") : t("View my orders")}
                </Link>
              </div>
            ) : (
              <div className="space-y-3 rounded-lg border p-5 text-sm">
                <p className="font-medium">{t("You won this auction.")}</p>
                <p className="text-muted-foreground">
                  {t("Pay now to confirm your order. Taxes and fees are added at the next step.")}
                </p>
                <PayForAuctionForm
                  auctionId={auction.id}
                  total={formatPaise((view.topTotal ?? 0n).toString(), "INR")}
                />
              </div>
            )
          ) : null}

          {view.isSeller ? (
            <div className="space-y-3 rounded-lg border p-5 text-sm">
              <p className="font-medium">{t("This is your auction")}</p>
              {view.status === "SOLD" ? (
                <p className="text-muted-foreground">
                  {!paid
                    ? t("Waiting for the winner to place the order.")
                    : awaitingPayment
                      ? t("The winner placed the order and has not paid yet.")
                      : t("The winner has paid. The order is in your orders.")}
                </p>
              ) : null}
              {view.status === "OPEN" || (view.status === "SOLD" && !paid) ? (
                <CancelAuctionButton auctionId={auction.id} hasWinner={view.status === "SOLD"} />
              ) : null}
              <Link
                href={"/vendor/auctions" as Route}
                className={buttonVariants({ variant: "outline", className: "w-full" })}
              >
                {t("All my auctions")}
              </Link>
            </div>
          ) : null}

          {!session ? (
            <div className="space-y-3 rounded-lg border p-5 text-sm">
              <p className="font-medium">{t("Want to bid?")}</p>
              <p className="text-muted-foreground">
                {t("Sign in with your member account to place a bid.")}
              </p>
              <Link
                href={`/login?next=/auctions/${auction.id}` as Route}
                className={buttonVariants()}
              >
                {t("Sign in")}
              </Link>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
