import { getT } from "@/i18n/server";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Gavel } from "lucide-react";
import { AuctionStatusBadge } from "@/components/auction/badges";
import { Countdown } from "@/components/bidding/countdown";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getAuthSession } from "@/server/auth/session";
import { formatAuctionNumber, hasEnded } from "@/server/domain/auction/rules";
import { listAuctionsForBidder } from "@/server/repositories/auction/auction-repository";
import { formatPaise } from "@/lib/money";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Auction bids") };
}

export default async function MyAuctionsPage() {
  const t = await getT();
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (!session.permissions.has("auction:bid") || !session.hasMemberProfile) {
    redirect("/unauthorized");
  }

  const auctions = await listAuctionsForBidder(session.userId);
  const now = new Date();
  const browse = (
    <Link href={"/auctions" as Route} className={buttonVariants()}>
      {t("Browse open auctions")}
    </Link>
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1>{t("Auction bids")}</h1>
          <p className="text-muted-foreground">
            {t("Every auction you've bid in, and whether you are winning.")}
          </p>
        </div>
        {browse}
      </div>

      {auctions.length === 0 ? (
        <EmptyState
          icon={Gavel}
          title={t("You haven't bid in an auction yet")}
          description={t("Find an open auction and place your first bid.")}
          action={browse}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Auction")}</TableHead>
              <TableHead className="text-right">{t("Your highest bid")}</TableHead>
              <TableHead className="text-right">{t("Highest bid now")}</TableHead>
              <TableHead>{t("Result")}</TableHead>
              <TableHead>{t("Closes")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {auctions.map((auction) => {
              const open = auction.status === "OPEN" && !hasEnded(auction, now);
              const top = auction.bids[0]?.unitPrice ?? null;
              const leading = top !== null && auction.myBestUnitPrice === top;
              const won = auction.winningBid?.bidderId === session.userId;
              return (
                <TableRow key={auction.id}>
                  <TableCell>
                    <Link
                      href={`/auctions/${auction.id}` as Route}
                      className="font-medium hover:underline"
                    >
                      {auction.title}
                    </Link>
                    <p className="text-muted-foreground text-xs tabular-nums">
                      {formatAuctionNumber(auction.auctionSeq)}
                    </p>
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {auction.myBestUnitPrice !== null
                      ? formatPaise(auction.myBestUnitPrice.toString(), "INR")
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {top !== null ? formatPaise(top.toString(), "INR") : "—"}
                  </TableCell>
                  <TableCell>
                    {open ? (
                      leading ? (
                        <span className="text-success text-sm font-medium">
                          {t("You are leading")}
                        </span>
                      ) : (
                        <span className="text-destructive text-sm font-medium">{t("Outbid")}</span>
                      )
                    ) : won ? (
                      <span className="text-success text-sm font-medium">
                        {auction.checkoutId ? t("Won, order placed") : t("Won, pay now")}
                      </span>
                    ) : (
                      <AuctionStatusBadge
                        status={auction.status === "OPEN" ? "UNSOLD" : auction.status}
                      />
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {open ? (
                      <Countdown
                        closesAt={auction.closesAt.toISOString()}
                        serverNow={now.toISOString()}
                      />
                    ) : (
                      <span className="text-muted-foreground">{t("Ended")}</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
