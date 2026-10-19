import { formatListingId } from "@/server/domain/catalog/listing-id";
import { getT } from "@/i18n/server";
import { PendingChangeBanner } from "@/components/approvals/pending-change-banner";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getAuthSession } from "@/server/auth/session";
import { getCatalogRepository } from "@/server/repositories/catalog/registry";
import {
  CATALOG_LABELS,
  CATALOG_PERMISSIONS,
  kindFromRouteSegment,
} from "@/server/domain/catalog/types";
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
  if (!kind) return { title: "Catalog" };
  const listing = await getCatalogRepository(kind).getById(id);
  return { title: listing?.title ?? CATALOG_LABELS[kind].singular };
}

export default async function AdminListingDetailPage({ params }: PageProps) {
  const t = await getT();
  const { kind: kindSegment, id } = await params;
  const kind = kindFromRouteSegment(kindSegment);
  if (!kind) notFound();

  const session = await getAuthSession();
  if (!session) redirect("/login");
  // Staff-only area: `<kind>:read` is ALSO held by vendors and customers (for
  // the public catalog / their own listings), so it can't gate the all-vendors
  // admin view. Only reviewers (who hold `<kind>:approve`) get in.
  if (
    !session.permissions.has(CATALOG_PERMISSIONS[kind].read) ||
    !session.permissions.has(CATALOG_PERMISSIONS[kind].approve)
  ) {
    redirect("/unauthorized");
  }

  const repo = getCatalogRepository(kind);
  const [listing, categories] = await Promise.all([repo.getById(id), repo.listCategories()]);
  if (!listing) notFound();

  const labels = CATALOG_LABELS[kind];
  const canUpdate = session.permissions.has(CATALOG_PERMISSIONS[kind].update);
  const canApprove = session.permissions.has(CATALOG_PERMISSIONS[kind].approve);
  const canDelete = session.permissions.has(CATALOG_PERMISSIONS[kind].delete);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <PendingChangeBanner entityType={kind} entityId={listing.id} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1>{listing.title}</h1>
          <p className="text-muted-foreground">
            {listing.vendor.businessName} · {labels.singular} ·{" "}
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
              : listing.approver
                ? t("Last reviewed by {name}", {
                    name: listing.approver.fullName ?? listing.approver.email,
                  })
                : t("Awaiting review.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ListingStatusActions
            kind={kind}
            id={listing.id}
            approvalStatus={listing.approvalStatus}
            isActive={listing.isActive}
            canApprove={canApprove}
          />
        </CardContent>
      </Card>

      <ListingImagesCard kind={kind} listing={listing} />

      {canUpdate ? (
        <ListingDetailsCard
          kind={kind}
          listing={listing}
          categories={categories}
          description={
            session.permissions.has("change:apply_direct")
              ? t("Changes are saved straight away.")
              : t(
                  "Your changes go to a Super Admin for approval. The live listing stays as it is until then.",
                )
          }
        />
      ) : null}

      {canDelete ? (
        <ListingDangerZone
          kind={kind}
          listing={listing}
          redirectTo={`/admin/catalog/${kindSegment}`}
        />
      ) : null}
    </div>
  );
}
