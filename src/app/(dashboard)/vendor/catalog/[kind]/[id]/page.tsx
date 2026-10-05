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
import { ListingForm } from "@/components/catalog/listing-form";
import { ListingStatusActions } from "@/components/catalog/listing-status-actions";
import { ImageUploader } from "@/components/catalog/image-uploader";
import { DeleteListingButton } from "@/components/catalog/delete-listing-button";
import { updateListingAction } from "@/server/services/catalog-actions";

interface PageProps {
  params: Promise<{ kind: string; id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { kind: kindSegment, id } = await params;
  const kind = kindFromRouteSegment(kindSegment);
  if (!kind) return { title: "Catalog" };
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
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1>{listing.title}</h1>
          <p className="text-muted-foreground">{labels.singular}</p>
        </div>
        <div className="flex flex-wrap gap-1">
          <StatusBadge status={listing.approvalStatus} />
          {!listing.isActive ? <StatusBadge status="INACTIVE" /> : null}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
          <CardDescription>
            {listing.approvalStatus === "REJECTED" && listing.rejectedReason
              ? `Rejected: ${listing.rejectedReason}`
              : listing.approvalStatus === "PENDING"
                ? "Awaiting admin review."
                : "Live in the catalog when active."}
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

      <Card>
        <CardHeader>
          <CardTitle>Images</CardTitle>
          <CardDescription>The first image is used as the listing thumbnail.</CardDescription>
        </CardHeader>
        <CardContent>
          <ImageUploader kind={kind} itemId={listing.id} images={listing.images} />
        </CardContent>
      </Card>

      {canUpdate ? (
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
            <CardDescription>
              Editing an approved listing sends it back for re-review.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ListingForm
              kind={kind}
              action={updateListingAction}
              categories={categories}
              initialValues={{
                id: listing.id,
                categoryId: listing.categoryId,
                subcategoryId: listing.subcategoryId,
                title: listing.title,
                description: listing.description,
                price: listing.price !== null ? String(listing.price) : null,
                sku: "sku" in listing ? (listing.sku as string | null) : undefined,
                stock: "stock" in listing ? (listing.stock as number) : undefined,
                pricingType:
                  "pricingType" in listing ? (listing.pricingType as "FIXED" | "QUOTE") : undefined,
              }}
              submitLabel="Save changes"
            />
          </CardContent>
        </Card>
      ) : null}

      {canDelete ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive text-sm">Danger zone</CardTitle>
          </CardHeader>
          <CardContent>
            <DeleteListingButton
              kind={kind}
              id={listing.id}
              title={listing.title}
              redirectTo={`/vendor/catalog/${kindSegment}`}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
