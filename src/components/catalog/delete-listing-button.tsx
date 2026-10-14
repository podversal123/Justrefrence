"use client";

import { useT } from "@/i18n/provider";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { deleteListingAction } from "@/server/services/catalog-actions";
import type { CatalogKind } from "@/server/domain/catalog/types";

export function DeleteListingButton({
  kind,
  id,
  title,
  redirectTo,
}: {
  kind: CatalogKind;
  id: string;
  title: string;
  redirectTo: string;
}) {
  const t = useT();
  const router = useRouter();

  return (
    <ConfirmationDialog
      trigger={
        <Button variant="destructive" size="sm">
          <Trash2 />
          {t("Delete")}
        </Button>
      }
      title={`Delete "${title}"?`}
      description={t("This removes it from the catalog. This can't be undone from the UI.")}
      hiddenFields={{ kind, id }}
      confirmLabel={t("Delete")}
      variant="destructive"
      action={async (prevState, formData) => {
        const result = await deleteListingAction(prevState, formData);
        if (result.success) router.push(redirectTo as never);
        return result;
      }}
    />
  );
}
