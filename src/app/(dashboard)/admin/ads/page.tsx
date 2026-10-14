import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Megaphone } from "lucide-react";
import { getAuthSession } from "@/server/auth/session";
import { listAdsForReview } from "@/server/repositories/ads/ad-repository";
import { AdPreview } from "@/components/ads/ad-card";
import { ReviewAdActions } from "@/components/ads/ad-row-actions";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CursorPagination } from "@/components/ui/pagination";
import { canApprove, canReject, type AdStatus } from "@/server/domain/ads/rules";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Advertisements" };

const FILTERS: { key: AdStatus | "ALL"; label: string }[] = [
  { key: "PENDING", label: "Waiting" },
  { key: "APPROVED", label: "Approved" },
  { key: "REJECTED", label: "Not approved" },
  { key: "ALL", label: "All" },
];

export default async function AdminAdsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (!session.permissions.has("ad:review")) redirect("/unauthorized");

  const params = await searchParams;
  const filter = FILTERS.find((f) => f.key === params["status"])?.key ?? "PENDING";
  const { items, nextCursor } = await listAdsForReview({
    status: filter === "ALL" ? undefined : filter,
    cursor: params["cursor"],
  });

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div>
        <h1>Advertisements</h1>
        <p className="text-muted-foreground">
          Ads vendors want to show on the home page. Approve the good ones; turn down the rest with
          a reason the vendor can act on.
        </p>
      </div>

      <nav aria-label="Filter by status" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/admin/ads?status=${f.key}` as Route}
            aria-current={f.key === filter ? "page" : undefined}
            className={cn(
              buttonVariants({ variant: f.key === filter ? "default" : "outline", size: "sm" }),
            )}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {items.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title={filter === "PENDING" ? "Nothing is waiting" : "No ads here"}
          description="Ads vendors submit will appear here."
        />
      ) : (
        <>
          <ul className="space-y-3">
            {items.map((ad) => (
              <li key={ad.id}>
                <AdPreview ad={ad} vendorName={ad.vendor.businessName}>
                  <ReviewAdActions
                    adId={ad.id}
                    canApprove={canApprove(ad).ok}
                    canReject={canReject(ad).ok}
                  />
                </AdPreview>
              </li>
            ))}
          </ul>
          <CursorPagination nextCursor={nextCursor} />
        </>
      )}
    </div>
  );
}
