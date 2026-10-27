import { getT } from "@/i18n/server";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Megaphone } from "lucide-react";
import { getAuthSession } from "@/server/auth/session";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Advertisements") };
}

/**
 * The Advertisements entry in a member's menu. Ads are placed by sellers, so a seller goes straight
 * to their ads, and anyone else is told what is needed instead of landing on an "access denied" page.
 */
export default async function AdvertisementsPage() {
  const t = await getT();
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (session.vendorProfileId && session.permissions.has("ad:create")) redirect("/vendor/ads");

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
      <h1>{t("Advertisements")}</h1>
      <EmptyState
        icon={Megaphone}
        title={t("Advertising is for sellers")}
        description={t(
          "Sellers can promote their business in the Sponsored section on the home page. Become a seller to place an ad.",
        )}
        action={
          session.permissions.has("vendor:apply") ? (
            <Link href={"/become-seller" as Route} className={buttonVariants()}>
              {t("Become a seller")}
            </Link>
          ) : undefined
        }
      />
    </div>
  );
}
