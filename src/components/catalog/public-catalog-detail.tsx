import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Package } from "lucide-react";
import { getCatalogRepository } from "@/server/repositories/catalog/registry";
import { isPubliclyVisible } from "@/server/domain/catalog/state-machine";
import { CATALOG_LABELS, type CatalogKind } from "@/server/domain/catalog/types";
import { catalogImagePublicUrlClient } from "@/lib/catalog-image-url";
import { formatPaise } from "@/lib/money";
import { getAuthSession } from "@/server/auth/session";
import { AddToCartForm } from "@/components/catalog/add-to-cart-form";
import { Button } from "@/components/ui/button";

/** Shared detail view for /products/[slug], /services/[slug], /projects/[slug]. */
export async function PublicCatalogDetail({ kind, slug }: { kind: CatalogKind; slug: string }) {
  const repo = getCatalogRepository(kind);
  const listing = await repo.getBySlug(slug);

  // A listing that exists but isn't APPROVED + active is invisible to the
  // public — same 404, not a "not approved yet" message, so pending/rejected
  // listings can't be discovered by guessing slugs.
  if (!listing || !isPubliclyVisible(listing.approvalStatus, listing.isActive)) {
    notFound();
  }

  const labels = CATALOG_LABELS[kind];
  const images = listing.images as { id: string; storagePath: string }[];
  const session = await getAuthSession();
  const canPurchase = listing.price !== null && (kind !== "PRODUCT" || listing.stock > 0);

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-8 px-4 py-8 sm:grid-cols-2">
      <div className="space-y-3">
        <div className="bg-muted relative aspect-square overflow-hidden rounded-lg border">
          {images[0] ? (
            <Image
              src={catalogImagePublicUrlClient(images[0].storagePath)}
              alt={listing.title}
              fill
              className="object-cover"
              sizes="(min-width: 640px) 50vw, 100vw"
              priority
            />
          ) : (
            <div className="text-muted-foreground flex h-full items-center justify-center">
              <Package className="size-10" />
            </div>
          )}
        </div>
        {images.length > 1 ? (
          <div className="grid grid-cols-4 gap-2">
            {images.slice(1).map((image) => (
              <div
                key={image.id}
                className="bg-muted relative aspect-square overflow-hidden rounded-md border"
              >
                <Image
                  src={catalogImagePublicUrlClient(image.storagePath)}
                  alt=""
                  fill
                  className="object-cover"
                  sizes="120px"
                />
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="space-y-4">
        <div>
          <p className="text-muted-foreground text-sm">{labels.singular}</p>
          <h1>{listing.title}</h1>
          <p className="text-muted-foreground text-sm">Sold by {listing.vendor.businessName}</p>
        </div>
        <p className="text-2xl font-semibold">{formatPaise(listing.price, listing.currency)}</p>
        {listing.description ? (
          <p className="text-muted-foreground whitespace-pre-wrap">{listing.description}</p>
        ) : null}

        {kind === "PRODUCT" && listing.stock <= 0 ? (
          <p className="text-destructive text-sm font-medium">Out of stock</p>
        ) : null}

        {canPurchase ? (
          session ? (
            <AddToCartForm
              kind={kind}
              itemId={listing.id}
              maxQty={kind === "PRODUCT" ? listing.stock : null}
            />
          ) : (
            <Button nativeButton={false} render={<Link href="/login">Sign in to purchase</Link>} />
          )
        ) : null}
      </div>
    </div>
  );
}
