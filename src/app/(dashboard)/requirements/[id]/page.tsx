import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { BidsTable } from "@/components/bidding/bids-table";
import { CancelRequirementButton } from "@/components/bidding/bid-actions";
import { RequirementStatusBadge, TypeBadge } from "@/components/bidding/badges";
import { LivePanel } from "@/components/bidding/live-panel";
import { getAuthSession } from "@/server/auth/session";
import { loadRequirementView, viewerFromSession } from "@/server/domain/bidding/load-view";
import { toLiveSnapshot } from "@/server/domain/bidding/snapshot";
import { formatRequirementNumber } from "@/server/domain/bidding/rules";
import { formatDateTime } from "@/lib/format";
import { formatPaise } from "@/lib/money";

export const metadata: Metadata = { title: "Requirement" };

export default async function ManageRequirementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getAuthSession();
  if (!session) redirect("/login");

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();

  const loaded = await loadRequirementView(id, viewerFromSession(session));
  if (!loaded) notFound();
  const { requirement, view, now } = loaded;

  // Owner or staff only. Anyone else gets the same "not found" as a missing requirement.
  if (!view.isOwner && !view.isStaff) notFound();

  const number = formatRequirementNumber(requirement.reqSeq);
  const canAward = view.isOwner && session.permissions.has("bid:accept");
  const canCancel = view.isOwner && (view.status === "OPEN" || view.status === "CLOSED");

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <Link
        href={(view.isOwner ? "/requirements" : "/admin/bids") as Route}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" />
        {view.isOwner ? "My requirements" : "All bids"}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground text-sm font-medium tabular-nums">{number}</span>
            <TypeBadge type={requirement.type} />
            <RequirementStatusBadge status={view.status} />
          </div>
          <h1>{requirement.title}</h1>
          <p className="text-muted-foreground text-sm">
            {requirement.quantity.toLocaleString("en-IN")} {requirement.unit}
            {requirement.estimatedValue !== null
              ? ` · Max budget ${formatPaise(requirement.estimatedValue.toString(), "INR")}`
              : ""}{" "}
            · Closes {formatDateTime(requirement.closesAt)} IST
            {view.isStaff && !view.isOwner
              ? ` · Posted by ${requirement.buyer.fullName ?? "a member"}`
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/bids/${requirement.id}` as Route}
            className="text-primary inline-flex items-center gap-1 text-sm hover:underline"
          >
            Public page
            <ExternalLink className="size-4" />
          </Link>
          {canCancel ? <CancelRequirementButton requirementId={requirement.id} /> : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <section aria-labelledby="offers" className="space-y-3">
          <h2 id="offers" className="text-lg">
            Offers
          </h2>
          <BidsTable
            requirementId={requirement.id}
            view={view}
            quantity={requirement.quantity}
            canAward={canAward}
          />
          {view.status === "CLOSED" && canAward && view.visibleBids.length > 0 ? (
            <p className="text-muted-foreground text-xs">
              Bidding has ended. The lowest total is L1, but you are free to award any active offer.
            </p>
          ) : null}
          {view.status === "AWARDED" ? (
            <p className="text-sm font-medium">This requirement has been awarded.</p>
          ) : null}
        </section>

        <LivePanel
          requirementId={requirement.id}
          type={requirement.type}
          initial={toLiveSnapshot(requirement, view, now)}
          audience={view.isStaff ? "staff" : "owner"}
        />
      </div>
    </div>
  );
}
