"use client";

import { useRouter } from "next/navigation";
import { ListingForm, type CategoryOption } from "@/components/catalog/listing-form";
import { createListingAction } from "@/server/services/catalog-actions";
import type { CatalogKind } from "@/server/domain/catalog/types";

export function NewListingClient({
  kind,
  kindSegment,
  categories,
  vendors,
}: {
  kind: CatalogKind;
  kindSegment: string;
  categories: CategoryOption[];
  vendors: { id: string; businessName: string }[];
}) {
  const router = useRouter();

  return (
    <ListingForm
      kind={kind}
      action={createListingAction}
      categories={categories}
      vendors={vendors}
      submitLabel="Create"
      onSuccess={(id) => router.push(`/admin/catalog/${kindSegment}/${id}` as never)}
    />
  );
}
