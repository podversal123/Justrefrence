import { getT } from "@/i18n/server";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Gavel } from "lucide-react";
import { AuctionCard } from "@/components/auction/auction-card";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getAuthSession } from "@/server/auth/session";
import { listAuctionsForVendor } from "@/server/repositories/auction/auction-repository";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("My auctions") };
}

export default async function VendorAuctionsPage() {
  const t = await getT();
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (!session.permissions.has("auction:create") || !session.vendorProfileId) {
    redirect("/unauthorized");
  }

  const auctions = await listAuctionsForVendor(session.vendorProfileId);
  const now = new Date();
  const start = (
    <Link href={"/vendor/auctions/new" as Route} className={buttonVariants()}>
      {t("Start an auction")}
    </Link>
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1>{t("My auctions")}</h1>
          <p className="text-muted-foreground">
            {t(
              "Put one of your listings up for auction. The highest bid wins when the timer ends.",
            )}
          </p>
        </div>
        {start}
      </div>

      {auctions.length === 0 ? (
        <EmptyState
          icon={Gavel}
          title={t("You haven't started an auction yet")}
          description={t(
            "Pick one of your approved listings, set a starting price and a closing time.",
          )}
          action={start}
        />
      ) : (
        <ul className="space-y-3">
          {auctions.map((auction) => (
            <li key={auction.id}>
              <AuctionCard auction={auction} serverNow={now} href={`/auctions/${auction.id}`} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
