import { Trophy } from "lucide-react";
import { AwardButton } from "@/components/bidding/bid-actions";
import { BidStatusBadge } from "@/components/bidding/badges";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatRank } from "@/server/domain/bidding/rules";
import { formatPaise } from "@/lib/money";
import type { RequirementViewModel } from "@/server/domain/bidding/view";

/**
 * The buyer's (or staff's) view of the offers. What appears here is decided
 * entirely by buildRequirementView(): sealed tenders show nothing but a count
 * until bidding ends, live auctions show anonymous ranked prices, and the
 * Award button only exists once bidding is over.
 */
export function BidsTable({
  requirementId,
  view,
  quantity,
  canAward,
}: {
  requirementId: string;
  view: RequirementViewModel;
  quantity: number;
  canAward: boolean;
}) {
  if (view.listMode === "COUNT_ONLY") {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center">
        <p className="text-3xl font-semibold tabular-nums">{view.bidCount}</p>
        <p className="text-muted-foreground mt-1 text-sm">
          {view.bidCount === 1 ? "bid received" : "bids received"} so far. Offers are sealed —
          prices and vendor names appear here when bidding closes.
        </p>
      </div>
    );
  }

  if (view.visibleBids.length === 0) {
    return (
      <div className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
        No bids yet.
      </div>
    );
  }

  const awardable = canAward && view.status === "CLOSED";
  const anonymous = view.listMode === "ANONYMOUS_LIVE";

  return (
    <div className="space-y-2">
      {anonymous ? (
        <p className="text-muted-foreground text-xs">
          Live ranking. Bidder identities are hidden until the auction closes.
        </p>
      ) : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Rank</TableHead>
            <TableHead>Bidder</TableHead>
            <TableHead className="text-right">Per unit</TableHead>
            <TableHead className="text-right">Total ({quantity.toLocaleString("en-IN")})</TableHead>
            <TableHead>Delivery</TableHead>
            <TableHead>Status</TableHead>
            {awardable ? (
              <TableHead>
                <span className="sr-only">Award</span>
              </TableHead>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {view.visibleBids.map((bid) => (
            <TableRow
              key={`${bid.rank}-${bid.bidderLabel}`}
              className={bid.rank === 1 ? "bg-success/5" : undefined}
            >
              <TableCell className="font-semibold">
                <span className="inline-flex items-center gap-1">
                  {bid.rank === 1 ? (
                    <Trophy className="text-success size-4" aria-hidden="true" />
                  ) : null}
                  {formatRank(bid.rank)}
                </span>
              </TableCell>
              <TableCell>{bid.bidderLabel}</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatPaise(bid.unitPrice.toString(), "INR")}
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {formatPaise(bid.totalPrice.toString(), "INR")}
              </TableCell>
              <TableCell className="text-sm">{bid.deliveryDays} days</TableCell>
              <TableCell>
                <BidStatusBadge status={bid.status} />
              </TableCell>
              {awardable ? (
                <TableCell>
                  {bid.bidId && bid.status === "ACTIVE" ? (
                    <AwardButton
                      requirementId={requirementId}
                      bidId={bid.bidId}
                      bidderLabel={bid.bidderLabel}
                      total={formatPaise(bid.totalPrice.toString(), "INR")}
                    />
                  ) : null}
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
