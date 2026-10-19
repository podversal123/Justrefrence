import { formatListingId } from "@/server/domain/catalog/listing-id";
import { getT } from "@/i18n/server";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getAuthSession } from "@/server/auth/session";
import { getCatalogRepository } from "@/server/repositories/catalog/registry";
import {
  CATALOG_LABELS,
  CATALOG_PERMISSIONS,
  kindFromRouteSegment,
} from "@/server/domain/catalog/types";
import { canManageListing } from "@/server/domain/catalog/ownership";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { ListingStatusActions } from "@/components/catalog/listing-status-actions";
import {
  ListingDangerZone,
  ListingDetailsCard,
  ListingImagesCard,
} from "@/components/catalog/listing-detail-sections";

interface PageProps {
  params: Promise<{ kind: string; id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { kind: kindSegment, id } = await params;
  const kind = kindFromRouteSegment(kindSegment);
  if (!kind) return { title: (await getT())("Catalog") };
  const listing = await getCatalogRepository(kind).getById(id);
  return { title: listing?.title ?? CATALOG_LABELS[kind].singular };
}

/**
 * Vendor's own listing detail — "not found" (never "forbidden") is
 * deliberately returned when the listing belongs to another vendor, so the
 * response doesn't confirm/deny that a given listing id exists for someone
 * else's catalog. See docs/rbac.md §1 and the Phase 3 brief's cross-vendor
 * access requirement.
 */
export default async function VendorListingDetailPage({ params }: PageProps) {
  const t = await getT();
  const { kind: kindSegment, id } = await params;
  const kind = kindFromRouteSegment(kindSegment);
  if (!kind) notFound();

  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (!session.permissions.has(CATALOG_PERMISSIONS[kind].read)) redirect("/unauthorized");
  if (!session.vendorProfileId) redirect("/unauthorized");

  const repo = getCatalogRepository(kind);
  const [listing, categories] = await Promise.all([repo.getById(id), repo.listCategories()]);
  if (!listing) notFound();
  if (!canManageListing(session.vendorProfileId, listing.vendorId)) notFound();

  const labels = CATALOG_LABELS[kind];
  const canUpdate = session.permissions.has(CATALOG_PERMISSIONS[kind].update);
  const canDelete = session.permissions.has(CATALOG_PERMISSIONS[kind].delete);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1>{listing.title}</h1>
          <p className="text-muted-foreground">
            {labels.singular} ·{" "}
            <span className="font-mono">{formatListingId(kind, listing.listingSeq)}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          <StatusBadge status={listing.approvalStatus} />
          {!listing.isActive ? <StatusBadge status="INACTIVE" /> : null}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("Status")}</CardTitle>
          <CardDescription>
            {listing.approvalStatus === "REJECTED" && listing.rejectedReason
              ? t("Rejected: {reason}", { reason: listing.rejectedReason })
              : listing.approvalStatus === "PENDING"
                ? t("Awaiting admin review.")
                : t("Live in the catalog when active.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ListingStatusActions
            kind={kind}
            id={listing.id}
            approvalStatus={listing.approvalStatus}
            isActive={listing.isActive}
            canApprove={false}
          />
        </CardContent>
      </Card>

      <ListingImagesCard kind={kind} listing={listing} />

      {canUpdate ? (
        <ListingDetailsCard
          kind={kind}
          listing={listing}
          categories={categories}
          description={t("Editing an approved listing sends it back for re-review.")}
        />
      ) : null}

      {canDelete ? (
        <ListingDangerZone
          kind={kind}
          listing={listing}
          redirectTo={`/vendor/catalog/${kindSegment}`}
        />
      ) : null}
    </div>
  );
}
