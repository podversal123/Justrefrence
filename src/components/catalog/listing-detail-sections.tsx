import type { ComponentProps } from "react";
import { getT } from "@/i18n/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ListingForm } from "@/components/catalog/listing-form";
import { ImageUploader } from "@/components/catalog/image-uploader";
import { DeleteListingButton } from "@/components/catalog/delete-listing-button";
import { updateListingAction } from "@/server/services/catalog-actions";
import { formatPaise } from "@/lib/money";
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

/** The project-only values of a project row, shaped for the form (money as paise strings). */
function projectInitialValues(listing: object) {
  const row = listing as Record<string, unknown>;
  if (!("timeline" in row)) return {};
  const paise = (value: unknown) => (typeof value === "bigint" ? String(value) : null);
  return {
    timeline: (row["timeline"] as string | null) ?? null,
    advancePayment: paise(row["advancePayment"]),
    balancePayment: paise(row["balancePayment"]),
    fullPayment: paise(row["fullPayment"]),
    termsNotes: (row["termsNotes"] as string | null) ?? null,
    documentName: (row["documentName"] as string | null) ?? null,
  };
}

/**
 * A project's extra details as plain text, for the Admin who reviews it (and for the seller to
 * check what was sent). Shown only when the seller filled something in.
 */
export async function ProjectTermsCard({ listing }: { listing: ListingFields }) {
  const t = await getT();
  const row = listing as unknown as Record<string, unknown>;
  const money = (value: unknown) => (typeof value === "bigint" ? formatPaise(String(value)) : null);
  const rows: [string, string | null][] = [
    [t("Time to complete"), (row["timeline"] as string | null) ?? null],
    [t("Advance payment"), money(row["advancePayment"])],
    [t("Balance payment"), money(row["balancePayment"])],
    [t("Full payment"), money(row["fullPayment"])],
  ];
  const notes = (row["termsNotes"] as string | null) ?? null;
  const documentName = (row["documentName"] as string | null) ?? null;
  if (rows.every(([, value]) => !value) && !notes && !documentName) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Project terms")}</CardTitle>
        <CardDescription>
          {t("What the seller added for payment, timing and conditions.")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <dl>
          {rows
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 border-b py-2 last:border-b-0">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-medium">{value}</dd>
              </div>
            ))}
        </dl>
        {notes ? <p className="whitespace-pre-line">{notes}</p> : null}
        {documentName ? (
          <p>
            <a
              href={`/api/catalog/project-doc/${listing.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              {documentName}
            </a>
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
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
  canEditProjectDetails = true,
}: {
  kind: Kind;
  listing: ListingFields;
  categories: FormProps["categories"];
  /** Project only: whether the time, payment, document and terms fields are editable here (not for an Admin). */
  canEditProjectDetails?: boolean;
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
            ...projectInitialValues(listing),
          }}
          projectDetails={canEditProjectDetails}
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
