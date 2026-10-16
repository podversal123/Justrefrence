import type { ComponentProps } from "react";
import { getT } from "@/i18n/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ListingForm } from "@/components/catalog/listing-form";
import { ImageUploader } from "@/components/catalog/image-uploader";
import { DeleteListingButton } from "@/components/catalog/delete-listing-button";
import { updateListingAction } from "@/server/services/catalog-actions";
import type { CatalogKind } from "@/server/domain/catalog/types";

/**
 * The parts of a listing's detail page that are the same for the Admin and the Seller: images, the edit
 * form and the delete button. Who may see each part, and the wording around it, is decided by the page.
 */

type Kind = CatalogKind;
type FormProps = ComponentProps<typeof ListingForm>;

interface ListingFields {
  id: string;
  title: string;
  categoryId: string;
  subcategoryId: string | null;
  description: string | null;
  price: unknown;
  images: ComponentProps<typeof ImageUploader>["images"];
}

export async function ListingImagesCard({ kind, listing }: { kind: Kind; listing: ListingFields }) {
  const t = await getT();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Images")}</CardTitle>
        <CardDescription>{t("The first image is used as the listing thumbnail.")}</CardDescription>
      </CardHeader>
      <CardContent>
        <ImageUploader kind={kind} itemId={listing.id} images={listing.images} />
      </CardContent>
    </Card>
  );
}

export async function ListingDetailsCard({
  kind,
  listing,
  categories,
  description,
}: {
  kind: Kind;
  listing: ListingFields;
  categories: FormProps["categories"];
  /** What happens when the form is saved, which differs between an Admin and a Seller. */
  description: string;
}) {
  const t = await getT();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Details")}</CardTitle>
        <CardDescription>{description}</CardDescription>
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
          submitLabel={t("Save changes")}
        />
      </CardContent>
    </Card>
  );
}

export async function ListingDangerZone({
  kind,
  listing,
  redirectTo,
}: {
  kind: Kind;
  listing: Pick<ListingFields, "id" | "title">;
  redirectTo: string;
}) {
  const t = await getT();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-destructive text-sm">{t("Danger zone")}</CardTitle>
      </CardHeader>
      <CardContent>
        <DeleteListingButton
          kind={kind}
          id={listing.id}
          title={listing.title}
          redirectTo={redirectTo}
        />
      </CardContent>
    </Card>
  );
}
