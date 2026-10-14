"use client";

import { useT } from "@/i18n/provider";
import { useRouter } from "next/navigation";
import { ListingForm, type CategoryOption } from "@/components/catalog/listing-form";
import { createListingAction } from "@/server/services/catalog-actions";
import type { CatalogKind } from "@/server/domain/catalog/types";

export function NewListingClient({
  kind,
  kindSegment,
  categories,
}: {
  kind: CatalogKind;
  kindSegment: string;
  categories: CategoryOption[];
}) {
  const t = useT();
  const router = useRouter();

  return (
    <ListingForm
      kind={kind}
      action={createListingAction}
      categories={categories}
      submitLabel={t("Create")}
      onSuccess={(id) => router.push(`/vendor/catalog/${kindSegment}/${id}` as never)}
    />
  );
}
