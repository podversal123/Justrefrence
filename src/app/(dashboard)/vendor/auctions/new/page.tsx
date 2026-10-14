import { getT } from "@/i18n/server";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getAuthSession } from "@/server/auth/session";
import { listAuctionableListings } from "@/server/repositories/auction/auction-repository";
import { AuctionForm } from "./auction-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Start an auction") };
}

export default async function NewAuctionPage() {
  const t = await getT();
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (!session.permissions.has("auction:create") || !session.vendorProfileId) {
    redirect("/unauthorized");
  }

  const listings = await listAuctionableListings(session.vendorProfileId);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <Link
        href={"/vendor/auctions" as Route}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" />
        {t("My auctions")}
      </Link>
      <div>
        <h1>{t("Start an auction")}</h1>
        <p className="text-muted-foreground">
          {t(
            "Members bid the price up. When the timer ends, the highest bid wins and the winner pays at that price.",
          )}
        </p>
      </div>
      <AuctionForm
        listings={listings.map((l) => ({
          value: `${l.kind}:${l.id}`,
          label: `${l.title} (${l.kind === "PRODUCT" ? "Product" : l.kind === "SERVICE" ? "Service" : "Project"})`,
          stock: l.stock,
        }))}
      />
    </div>
  );
}
