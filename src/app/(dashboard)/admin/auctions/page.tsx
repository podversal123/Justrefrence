import { getT } from "@/i18n/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Gavel } from "lucide-react";
import { AuctionCard } from "@/components/auction/auction-card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { CursorPagination } from "@/components/ui/pagination";
import { getAuthSession } from "@/server/auth/session";
import {
  listAllAuctionsForStaff,
  type AuctionState,
} from "@/server/repositories/auction/auction-repository";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("All auctions") };
}

const STATES: AuctionState[] = ["open", "ended", "all"];

export default async function AdminAuctionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const t = await getT();
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (!session.permissions.has("auction:read:any")) redirect("/unauthorized");

  const params = await searchParams;
  const state = STATES.find((s) => s === params["state"]) ?? "all";
  const search = params["search"]?.slice(0, 100);
  const now = new Date();
  const { items, nextCursor } = await listAllAuctionsForStaff(
    { state, search, cursor: params["cursor"] },
    now,
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div>
        <h1>{t("All auctions")}</h1>
        <p className="text-muted-foreground">
          {t("Every auction on the platform. Open one to see all bids with the real bidder names.")}
        </p>
      </div>

      <form method="get" role="search" className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label htmlFor="aa-search" className="text-xs font-medium">
            {t("Search")}
          </label>
          <Input
            id="aa-search"
            name="search"
            defaultValue={search}
            placeholder={t("Title, seller or AUC-000012")}
            className="w-72"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="aa-state" className="text-xs font-medium">
            {t("Status")}
          </label>
          <NativeSelect id="aa-state" name="state" defaultValue={state} className="w-40">
            <option value="all">{t("All")}</option>
            <option value="open">{t("Open")}</option>
            <option value="ended">{t("Ended")}</option>
          </NativeSelect>
        </div>
        <Button type="submit">{t("Apply")}</Button>
      </form>

      {items.length === 0 ? (
        <EmptyState
          icon={Gavel}
          title={t("No auctions found")}
          description={t("Auctions vendors start will appear here.")}
        />
      ) : (
        <>
          <ul className="space-y-3">
            {items.map((auction) => (
              <li key={auction.id}>
                <AuctionCard auction={auction} serverNow={now} href={`/auctions/${auction.id}`} />
              </li>
            ))}
          </ul>
          <CursorPagination nextCursor={nextCursor} />
        </>
      )}
    </div>
  );
}
