import { getFormat, getT } from "@/i18n/server";
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
import { formatPaise } from "@/lib/money";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Requirement") };
}

export default async function ManageRequirementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = await getT();
  const { formatDateTime } = await getFormat();
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
        {view.isOwner ? t("My requirements") : t("All bids")}
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
              ? ` · ${t("Max budget {amount}", { amount: formatPaise(requirement.estimatedValue.toString(), "INR") })}`
              : ""}{" "}
            · {t("Closes {date} IST", { date: formatDateTime(requirement.closesAt) })}
            {view.isStaff && !view.isOwner
              ? ` · ${t("Posted by {name}", { name: requirement.buyer.fullName ?? t("a member") })}`
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/bids/${requirement.id}` as Route}
            className="text-primary inline-flex items-center gap-1 text-sm hover:underline"
          >
            {t("Public page")}
            <ExternalLink className="size-4" />
          </Link>
          {canCancel ? <CancelRequirementButton requirementId={requirement.id} /> : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <section aria-labelledby="offers" className="space-y-3">
          <h2 id="offers" className="text-lg">
            {t("Offers")}
          </h2>
          <BidsTable
            requirementId={requirement.id}
            view={view}
            quantity={requirement.quantity}
            canAward={canAward}
          />
          {view.status === "CLOSED" && canAward && view.visibleBids.length > 0 ? (
            <p className="text-muted-foreground text-xs">
              {t(
                "Bidding has ended. The lowest total is L1, but you are free to award any active offer.",
              )}
            </p>
          ) : null}
          {view.status === "AWARDED" ? (
            <p className="text-sm font-medium">{t("This requirement has been awarded.")}</p>
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
