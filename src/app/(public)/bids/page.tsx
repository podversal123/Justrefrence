import { msg } from "@/i18n/locales";
import { getT } from "@/i18n/server";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { Gavel, SearchX } from "lucide-react";
import { RequirementCard } from "@/components/bidding/requirement-card";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { CursorPagination } from "@/components/ui/pagination";
import { getAuthSession } from "@/server/auth/session";
import {
  listRequirements,
  type RequirementState,
} from "@/server/repositories/bidding/bidding-repository";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t("Bids and auctions"),
    description: t(
      "Open requirements from buyers. Approved vendors bid in sealed tenders and live reverse auctions.",
    ),
  };
}

const STATES: { key: RequirementState; label: string }[] = [
  { key: "open", label: msg("Open for bidding") },
  { key: "closed", label: msg("Closed") },
  { key: "all", label: msg("All") },
];
const KINDS = ["PRODUCT", "SERVICE", "PROJECT"] as const;
const TYPES = ["TENDER", "REVERSE_AUCTION"] as const;

export default async function BidsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const t = await getT();
  const params = await searchParams;
  const state = STATES.find((s) => s.key === params["state"])?.key ?? "open";
  const kind = KINDS.find((k) => k === params["kind"]);
  const type = TYPES.find((t) => t === params["type"]);
  const search = params["search"]?.slice(0, 100);

  const session = await getAuthSession();
  const now = new Date();

  let items: Awaited<ReturnType<typeof listRequirements>>["items"] = [];
  let nextCursor: string | null = null;
  let failed = false;
  try {
    ({ items, nextCursor } = await listRequirements(
      { state, kind, type, search, cursor: params["cursor"] },
      now,
    ));
  } catch (error) {
    console.error("[bids] failed to load requirements", error);
    failed = true;
  }

  const filtered = Boolean(search || kind || type || state !== "open");
  const canPost = Boolean(session?.permissions.has("requirement:create"));

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <nav aria-label={t("Breadcrumb")} className="text-muted-foreground mb-2 text-xs">
            <Link href="/" className="hover:text-foreground">
              {t("Home")}
            </Link>{" "}
            / <span aria-current="page">{t("Bids and auctions")}</span>
          </nav>
          <h1>{t("Bids and auctions")}</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
            {t(
              "Buyers post what they need. Approved vendors compete in sealed tenders and live reverse auctions, and the buyer awards the best offer.",
            )}
          </p>
        </div>
        {canPost ? (
          <Link href={"/requirements/new" as Route} className={buttonVariants({ size: "touch" })}>
            {t("Post a requirement")}
          </Link>
        ) : session ? null : (
          <Link
            href={"/login?next=/requirements/new" as Route}
            className={buttonVariants({ size: "touch", variant: "outline" })}
          >
            {t("Sign in to post a requirement")}
          </Link>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
        <aside aria-label={t("Filters")} className="lg:sticky lg:top-32 lg:self-start">
          <form method="get" role="search" className="space-y-4 rounded-lg border p-4">
            <div className="space-y-1">
              <label htmlFor="b-search" className="text-xs font-medium">
                {t("Search")}
              </label>
              <Input
                id="b-search"
                name="search"
                defaultValue={search}
                placeholder={t("Title, city or REQ-000012")}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="b-state" className="text-xs font-medium">
                {t("Status")}
              </label>
              <NativeSelect id="b-state" name="state" defaultValue={state}>
                {STATES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {t(s.label)}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1">
              <label htmlFor="b-type" className="text-xs font-medium">
                {t("Bidding type")}
              </label>
              <NativeSelect id="b-type" name="type" defaultValue={type ?? ""}>
                <option value="">{t("All types")}</option>
                <option value="TENDER">{t("Sealed tender")}</option>
                <option value="REVERSE_AUCTION">{t("Reverse auction")}</option>
              </NativeSelect>
            </div>
            <div className="space-y-1">
              <label htmlFor="b-kind" className="text-xs font-medium">
                {t("Looking for")}
              </label>
              <NativeSelect id="b-kind" name="kind" defaultValue={kind ?? ""}>
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
                <Link href={"/bids" as Route} className={cn(buttonVariants({ variant: "ghost" }))}>
                  {t("Clear")}
                </Link>
              ) : null}
            </div>
          </form>
        </aside>

        <section aria-label={t("Requirements")} className="space-y-3">
          {failed ? (
            <ErrorState
              description={t(
                "We couldn't load requirements right now. Please try again in a moment.",
              )}
            />
          ) : items.length === 0 ? (
            <EmptyState
              icon={filtered ? SearchX : Gavel}
              title={filtered ? t("No requirements match") : t("No open requirements right now")}
              description={
                filtered
                  ? t("Try clearing a filter or searching for something broader.")
                  : t("When a buyer posts what they need, it appears here for vendors to bid on.")
              }
            />
          ) : (
            <>
              <p className="text-muted-foreground text-sm">
                {items.length === 1
                  ? t("Showing 1 requirement")
                  : t("Showing {count} requirements", { count: items.length })}
                {nextCursor ? t(" (more below)") : ""}
              </p>
              <ul className="space-y-3">
                {items.map((requirement) => (
                  <li key={requirement.id}>
                    <RequirementCard
                      requirement={requirement}
                      serverNow={now}
                      href={`/bids/${requirement.id}`}
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
