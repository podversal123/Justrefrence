import { T } from "@/i18n/t-text";
import { msg } from "@/i18n/locales";
import { getFormat, getT } from "@/i18n/server";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { CalendarClock, Gavel, MapPin, Package, Wallet } from "lucide-react";
import { LivePanel } from "@/components/bidding/live-panel";
import { PlaceBidForm } from "@/components/bidding/place-bid-form";
import { BidStatusBadge, RequirementStatusBadge, TypeBadge } from "@/components/bidding/badges";
import { buttonVariants } from "@/components/ui/button";
import { getAuthSession } from "@/server/auth/session";
import { loadRequirementView, viewerFromSession } from "@/server/domain/bidding/load-view";
import { toLiveSnapshot } from "@/server/domain/bidding/snapshot";
import { formatRequirementNumber } from "@/server/domain/bidding/rules";
import { getRequirementById } from "@/server/repositories/bidding/bidding-repository";
import { formatPaise } from "@/lib/money";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const t = await getT();
  if (!z.string().uuid().safeParse(id).success) return { title: t("Requirement not found") };
  const requirement = await getRequirementById(id).catch(() => null);
  if (!requirement) return { title: t("Requirement not found") };
  return { title: `${formatRequirementNumber(requirement.reqSeq)}: ${requirement.title}` };
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

export default async function BidDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const { formatDateTime } = await getFormat();
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();

  const session = await getAuthSession();
  const loaded = await loadRequirementView(id, viewerFromSession(session));
  if (!loaded) notFound();
  const { requirement, view, now } = loaded;

  const number = formatRequirementNumber(requirement.reqSeq);
  const canBid = Boolean(session?.permissions.has("bid:submit") && session.vendorProfileId);
  const audience = view.isStaff ? "staff" : view.isOwner ? "owner" : canBid ? "vendor" : "public";
  const open = view.status === "OPEN";

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <nav aria-label={t("Breadcrumb")} className="text-muted-foreground mb-4 text-xs">
        <Link href="/" className="hover:text-foreground">
          {t("Home")}
        </Link>{" "}
        /{" "}
        <Link href={"/bids" as Route} className="hover:text-foreground">
          {t("Bids and auctions")}
        </Link>{" "}
        / <span aria-current="page">{number}</span>
      </nav>

      <div className="mb-6 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-sm font-medium tabular-nums">{number}</span>
          <TypeBadge type={requirement.type} />
          <RequirementStatusBadge status={view.status} />
        </div>
        <h1>{requirement.title}</h1>
        <p className="text-muted-foreground text-sm">
          {t("Posted {date}", { date: formatDateTime(requirement.createdAt) })}
          {view.isOwner || view.isStaff
            ? ` ${t("by {name}", { name: requirement.buyer.fullName ?? t("a member") })}`
            : ""}
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-8">
          <section aria-labelledby="req-details" className="space-y-3">
            <h2 id="req-details" className="text-lg">
              {t("Requirement")}
            </h2>
            <p className="whitespace-pre-wrap">{requirement.description}</p>
          </section>

          <section aria-labelledby="req-facts" className="space-y-3">
            <h2 id="req-facts" className="text-lg">
              {t("Key details")}
            </h2>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Fact icon={Package} label={t("Quantity")}>
                {requirement.quantity.toLocaleString("en-IN")} {requirement.unit} ·{" "}
                <T text={KIND_LABEL[requirement.itemKind] ?? requirement.itemKind} />
                {requirement.categoryLabel ? ` · ${requirement.categoryLabel}` : ""}
              </Fact>
              {requirement.deliveryCity ? (
                <Fact icon={MapPin} label={t("Deliver to")}>
                  {requirement.deliveryCity}
                </Fact>
              ) : null}
              <Fact icon={CalendarClock} label={open ? t("Bidding closes") : t("Bidding closed")}>
                {t("{date} IST", { date: formatDateTime(requirement.closesAt) })}
              </Fact>
              {requirement.estimatedValue !== null ? (
                <Fact icon={Wallet} label={t("Maximum budget (total)")}>
                  {formatPaise(requirement.estimatedValue.toString(), "INR")}
                </Fact>
              ) : null}
              {requirement.type === "REVERSE_AUCTION" ? (
                <Fact icon={Gavel} label={t("Auction rules")}>
                  {requirement.minDecrement > 0n
                    ? `Each bid must drop by at least ${formatPaise(requirement.minDecrement.toString(), "INR")} per unit. `
                    : t("Any lower price is accepted. ")}
                  {requirement.autoExtendMinutes > 0
                    ? `A bid in the last ${requirement.autoExtendMinutes} minutes extends bidding by ${requirement.autoExtendMinutes} minutes.`
                    : t("Closing time is fixed.")}
                </Fact>
              ) : null}
            </dl>
          </section>

          {requirement.status === "CANCELLED" && requirement.cancelledReason ? (
            <p className="border-destructive/30 bg-destructive/5 rounded-lg border p-4 text-sm">
              <span className="font-medium">{t("Cancelled:")}</span> {requirement.cancelledReason}
            </p>
          ) : null}
        </div>

        <aside className="space-y-4" aria-label={t("Bidding")}>
          <LivePanel
            requirementId={requirement.id}
            type={requirement.type}
            initial={toLiveSnapshot(requirement, view, now)}
            audience={audience}
          />

          {audience === "vendor" ? (
            open ? (
              <PlaceBidForm
                requirementId={requirement.id}
                quantity={requirement.quantity}
                unit={requirement.unit}
                type={requirement.type}
                minDecrement={requirement.minDecrement.toString()}
                maxBudget={requirement.estimatedValue?.toString() ?? null}
                existing={
                  view.myBid && view.myBid.status === "ACTIVE"
                    ? {
                        unitPrice: view.myBid.unitPrice.toString(),
                        deliveryDays: view.myBid.deliveryDays,
                        note: view.myBid.note,
                      }
                    : null
                }
              />
            ) : view.myBid ? (
              <div className="space-y-2 rounded-lg border p-5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{t("Your bid")}</span>
                  <BidStatusBadge status={view.myBid.status} />
                </div>
                <p className="text-muted-foreground">
                  {view.myBid.status === "ACCEPTED"
                    ? t("Congratulations. The buyer awarded this requirement to you.")
                    : view.myBid.status === "REJECTED"
                      ? t("The buyer chose a different offer, or cancelled the requirement.")
                      : t("Bidding has ended. The buyer will award the requirement soon.")}
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground rounded-lg border p-5 text-sm">
                {t("Bidding on this requirement has ended.")}
              </p>
            )
          ) : null}

          {audience === "owner" || audience === "staff" ? (
            <Link
              href={`/requirements/${requirement.id}` as Route}
              className={buttonVariants({ size: "touch", className: "w-full" })}
            >
              {audience === "owner" ? t("Manage this requirement") : t("Open admin view")}
            </Link>
          ) : null}

          {audience === "public" ? (
            <div className="space-y-3 rounded-lg border p-5 text-sm">
              <p className="font-medium">{t("Want to bid on this?")}</p>
              <p className="text-muted-foreground">
                {session
                  ? t(
                      "Only approved vendors can place bids. Contact the team to register your business as a vendor.",
                    )
                  : t(
                      "Sign in with an approved vendor account to place a bid, or register your business as a vendor.",
                    )}
              </p>
              {session ? null : (
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/login?next=/bids/${requirement.id}` as Route}
                    className={buttonVariants()}
                  >
                    {t("Sign in")}
                  </Link>
                  <Link
                    href={"/become-seller" as Route}
                    className={buttonVariants({ variant: "outline" })}
                  >
                    {t("Become a vendor")}
                  </Link>
                </div>
              )}
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
