import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Gavel } from "lucide-react";
import { RequirementCard } from "@/components/bidding/requirement-card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { CursorPagination } from "@/components/ui/pagination";
import { getAuthSession } from "@/server/auth/session";
import {
  listAllRequirementsForStaff,
  type RequirementState,
} from "@/server/repositories/bidding/bidding-repository";

export const metadata: Metadata = { title: "All bids" };

const STATES: RequirementState[] = ["open", "closed", "all"];

export default async function AdminBidsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (!session.permissions.has("bid:read:any")) redirect("/unauthorized");

  const params = await searchParams;
  const state = STATES.find((s) => s === params["state"]) ?? "all";
  const search = params["search"]?.slice(0, 100);
  const now = new Date();
  const { items, nextCursor } = await listAllRequirementsForStaff(
    { state, search, cursor: params["cursor"] },
    now,
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div>
        <h1>All bids</h1>
        <p className="text-muted-foreground">
          Every requirement on the platform. Open one to see all offers, with prices and vendor
          names.
        </p>
      </div>

      <form method="get" role="search" className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label htmlFor="ab-search" className="text-xs font-medium">
            Search
          </label>
          <Input
            id="ab-search"
            name="search"
            defaultValue={search}
            placeholder="Title, city or REQ-000012"
            className="w-72"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="ab-state" className="text-xs font-medium">
            Status
          </label>
          <NativeSelect id="ab-state" name="state" defaultValue={state} className="w-40">
            <option value="all">All</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
          </NativeSelect>
        </div>
        <Button type="submit">Apply</Button>
      </form>

      {items.length === 0 ? (
        <EmptyState
          icon={Gavel}
          title="No requirements found"
          description="Requirements buyers post will appear here."
        />
      ) : (
        <>
          <ul className="space-y-3">
            {items.map((requirement) => (
              <li key={requirement.id}>
                <RequirementCard
                  requirement={requirement}
                  serverNow={now}
                  href={`/requirements/${requirement.id}`}
                />
              </li>
            ))}
          </ul>
          <CursorPagination nextCursor={nextCursor} />
        </>
      )}
    </div>
  );
}
