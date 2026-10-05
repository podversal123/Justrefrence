import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Gavel } from "lucide-react";
import { BidStatusBadge, RequirementStatusBadge, TypeBadge } from "@/components/bidding/badges";
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
import { effectiveStatus, formatRequirementNumber } from "@/server/domain/bidding/rules";
import { listBidsForVendor } from "@/server/repositories/bidding/bidding-repository";
import { formatPaise } from "@/lib/money";

export const metadata: Metadata = { title: "My bids" };

export default async function MyBidsPage() {
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (!session.permissions.has("bid:submit") || !session.vendorProfileId) redirect("/unauthorized");

  const bids = await listBidsForVendor(session.vendorProfileId);
  const now = new Date();
  const browse = (
    <Link href={"/bids" as Route} className={buttonVariants()}>
      Browse open requirements
    </Link>
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1>My bids</h1>
          <p className="text-muted-foreground">
            Every requirement you&apos;ve bid on, and where it stands.
          </p>
        </div>
        {browse}
      </div>

      {bids.length === 0 ? (
        <EmptyState
          icon={Gavel}
          title="You haven't bid yet"
          description="Find an open requirement and place your first bid. Reverse auctions run live, so check back often."
          action={browse}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Requirement</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Your total</TableHead>
              <TableHead>Bid</TableHead>
              <TableHead>Requirement status</TableHead>
              <TableHead>Closes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bids.map((bid) => {
              const status = effectiveStatus(bid.requirement, now);
              return (
                <TableRow key={bid.id}>
                  <TableCell>
                    <Link
                      href={`/bids/${bid.requirement.id}` as Route}
                      className="font-medium hover:underline"
                    >
                      {bid.requirement.title}
                    </Link>
                    <p className="text-muted-foreground text-xs tabular-nums">
                      {formatRequirementNumber(bid.requirement.reqSeq)}
                    </p>
                  </TableCell>
                  <TableCell>
                    <TypeBadge type={bid.requirement.type} />
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatPaise(bid.totalPrice.toString(), "INR")}
                  </TableCell>
                  <TableCell>
                    <BidStatusBadge status={bid.status} />
                  </TableCell>
                  <TableCell>
                    <RequirementStatusBadge status={status} />
                  </TableCell>
                  <TableCell className="text-sm">
                    {status === "OPEN" ? (
                      <Countdown
                        closesAt={bid.requirement.closesAt.toISOString()}
                        serverNow={now.toISOString()}
                      />
                    ) : (
                      <span className="text-muted-foreground">Closed</span>
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
