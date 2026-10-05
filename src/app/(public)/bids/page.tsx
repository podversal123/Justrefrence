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

export const metadata: Metadata = {
  title: "Bids and auctions",
  description:
    "Open requirements from buyers. Approved vendors bid in sealed tenders and live reverse auctions.",
};

const STATES: { key: RequirementState; label: string }[] = [
  { key: "open", label: "Open for bidding" },
  { key: "closed", label: "Closed" },
  { key: "all", label: "All" },
];
const KINDS = ["PRODUCT", "SERVICE", "PROJECT"] as const;
const TYPES = ["TENDER", "REVERSE_AUCTION"] as const;

export default async function BidsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
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
          <nav aria-label="Breadcrumb" className="text-muted-foreground mb-2 text-xs">
            <Link href="/" className="hover:text-foreground">
              Home
            </Link>{" "}
            / <span aria-current="page">Bids and auctions</span>
          </nav>
          <h1>Bids and auctions</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
            Buyers post what they need. Approved vendors compete in sealed tenders and live reverse
            auctions, and the buyer awards the best offer.
          </p>
        </div>
        {canPost ? (
          <Link href={"/requirements/new" as Route} className={buttonVariants({ size: "touch" })}>
            Post a requirement
          </Link>
        ) : session ? null : (
          <Link
            href={"/login?next=/requirements/new" as Route}
            className={buttonVariants({ size: "touch", variant: "outline" })}
          >
            Sign in to post a requirement
          </Link>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
        <aside aria-label="Filters" className="lg:sticky lg:top-32 lg:self-start">
          <form method="get" role="search" className="space-y-4 rounded-lg border p-4">
            <div className="space-y-1">
              <label htmlFor="b-search" className="text-xs font-medium">
                Search
              </label>
              <Input
                id="b-search"
                name="search"
                defaultValue={search}
                placeholder="Title, city or REQ-000012"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="b-state" className="text-xs font-medium">
                Status
              </label>
              <NativeSelect id="b-state" name="state" defaultValue={state}>
                {STATES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1">
              <label htmlFor="b-type" className="text-xs font-medium">
                Bidding type
              </label>
              <NativeSelect id="b-type" name="type" defaultValue={type ?? ""}>
                <option value="">All types</option>
                <option value="TENDER">Sealed tender</option>
                <option value="REVERSE_AUCTION">Reverse auction</option>
              </NativeSelect>
            </div>
            <div className="space-y-1">
              <label htmlFor="b-kind" className="text-xs font-medium">
                Looking for
              </label>
              <NativeSelect id="b-kind" name="kind" defaultValue={kind ?? ""}>
                <option value="">Everything</option>
                <option value="PRODUCT">Products</option>
                <option value="SERVICE">Services</option>
                <option value="PROJECT">Projects</option>
              </NativeSelect>
            </div>
            <div className="flex gap-2">
              <Button type="submit" className="flex-1">
                Apply
              </Button>
              {filtered ? (
                <Link href={"/bids" as Route} className={cn(buttonVariants({ variant: "ghost" }))}>
                  Clear
                </Link>
              ) : null}
            </div>
          </form>
        </aside>

        <section aria-label="Requirements" className="space-y-3">
          {failed ? (
            <ErrorState description="We couldn't load requirements right now. Please try again in a moment." />
          ) : items.length === 0 ? (
            <EmptyState
              icon={filtered ? SearchX : Gavel}
              title={filtered ? "No requirements match" : "No open requirements right now"}
              description={
                filtered
                  ? "Try clearing a filter or searching for something broader."
                  : "When a buyer posts what they need, it appears here for vendors to bid on."
              }
            />
          ) : (
            <>
              <p className="text-muted-foreground text-sm">
                Showing {items.length} requirement{items.length === 1 ? "" : "s"}
                {nextCursor ? " (more below)" : ""}
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
