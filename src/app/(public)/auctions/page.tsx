import { msg } from "@/i18n/locales";
import { getT } from "@/i18n/server";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { Gavel, SearchX } from "lucide-react";
import { AuctionCard } from "@/components/auction/auction-card";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { CursorPagination } from "@/components/ui/pagination";
import { getAuthSession } from "@/server/auth/session";
import { listAuctions, type AuctionState } from "@/server/repositories/auction/auction-repository";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t("Auctions"),
    description: t(
      "Vendors put products, services and projects up for auction. Place the highest bid before the timer ends.",
    ),
  };
}

const STATES: { key: AuctionState; label: string }[] = [
  { key: "open", label: msg("Open for bidding") },
  { key: "ended", label: msg("Ended") },
  { key: "all", label: msg("All") },
];
const KINDS = ["PRODUCT", "SERVICE", "PROJECT"] as const;

export default async function AuctionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const t = await getT();
  const params = await searchParams;
  const state = STATES.find((s) => s.key === params["state"])?.key ?? "open";
  const kind = KINDS.find((k) => k === params["kind"]);
  const search = params["search"]?.slice(0, 100);

  const session = await getAuthSession();
  const now = new Date();

  let items: Awaited<ReturnType<typeof listAuctions>>["items"] = [];
  let nextCursor: string | null = null;
  let failed = false;
  try {
    ({ items, nextCursor } = await listAuctions(
      { state, kind, search, cursor: params["cursor"] },
      now,
    ));
  } catch (error) {
    console.error("[auctions] failed to load auctions", error);
    failed = true;
  }

  const filtered = Boolean(search || kind || state !== "open");
  const canSell = Boolean(session?.permissions.has("auction:create") && session.vendorProfileId);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <nav aria-label={t("Breadcrumb")} className="text-muted-foreground mb-2 text-xs">
            <Link href="/" className="hover:text-foreground">
              {t("Home")}
            </Link>{" "}
            / <span aria-current="page">{t("Auctions")}</span>
          </nav>
          <h1>{t("Auctions")}</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
            {t(
              "Vendors put products, services and projects up for auction. Place the highest bid before the timer ends to win.",
            )}
          </p>
        </div>
        {canSell ? (
          <Link
            href={"/vendor/auctions/new" as Route}
            className={buttonVariants({ size: "touch" })}
          >
            {t("Start an auction")}
          </Link>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
        <aside aria-label={t("Filters")} className="lg:sticky lg:top-32 lg:self-start">
          <form method="get" role="search" className="space-y-4 rounded-lg border p-4">
            <div className="space-y-1">
              <label htmlFor="a-search" className="text-xs font-medium">
                {t("Search")}
              </label>
              <Input
                id="a-search"
                name="search"
                defaultValue={search}
                placeholder={t("Title, seller or AUC-000012")}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="a-state" className="text-xs font-medium">
                {t("Status")}
              </label>
              <NativeSelect id="a-state" name="state" defaultValue={state}>
                {STATES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {t(s.label)}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1">
              <label htmlFor="a-kind" className="text-xs font-medium">
                {t("Looking for")}
              </label>
              <NativeSelect id="a-kind" name="kind" defaultValue={kind ?? ""}>
                <option value="">{t("Everything")}</option>
                <option value="PRODUCT">{t("Products")}</option>
                <option value="SERVICE">{t("Services")}</option>
                <option value="PROJECT">{t("Projects")}</option>
              </NativeSelect>
            </div>
            <div className="flex gap-2">
              <Button type="submit" className="flex-1">
                {t("Apply")}
              </Button>
              {filtered ? (
                <Link
                  href={"/auctions" as Route}
                  className={cn(buttonVariants({ variant: "ghost" }))}
                >
                  {t("Clear")}
                </Link>
              ) : null}
            </div>
          </form>
        </aside>

        <section aria-label={t("Auctions")} className="space-y-3">
          {failed ? (
            <ErrorState
              description={t("We couldn't load auctions right now. Please try again in a moment.")}
            />
          ) : items.length === 0 ? (
            <EmptyState
              icon={filtered ? SearchX : Gavel}
              title={filtered ? t("No auctions match") : t("No open auctions right now")}
              description={
                filtered
                  ? t("Try clearing a filter or searching for something broader.")
                  : t("When a vendor starts an auction, it appears here for you to bid on.")
              }
            />
          ) : (
            <>
              <p className="text-muted-foreground text-sm">
                {items.length === 1
                  ? t("Showing 1 auction")
                  : t("Showing {count} auctions", { count: items.length })}
                {nextCursor ? t(" (more below)") : ""}
              </p>
              <ul className="space-y-3">
                {items.map((auction) => (
                  <li key={auction.id}>
                    <AuctionCard
                      auction={auction}
                      serverNow={now}
                      href={`/auctions/${auction.id}`}
                    />
                  </li>
                ))}
              </ul>
              <CursorPagination nextCursor={nextCursor} />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
