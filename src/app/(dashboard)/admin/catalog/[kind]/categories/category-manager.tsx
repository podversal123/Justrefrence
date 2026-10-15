"use client";

import { useT } from "@/i18n/provider";
import { useState } from "react";
import { useActionState } from "@/lib/use-action-state";
import { useFormStatus } from "react-dom";
import { AlertCircle, FolderTree, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createCategoryAction,
  createSubcategoryAction,
  removeCategoryAction,
  removeSubcategoryAction,
} from "@/server/services/catalog-actions";
import type { CatalogKind } from "@/server/domain/catalog/types";
import type { ApiResult } from "@/lib/api-response";

const nullState: ApiResult<{ id: string }> = {
  success: true,
  data: null as unknown as { id: string },
  meta: { requestId: "" },
};

function SubmitButton({ label }: { label: string }) {
  const t = useT();
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? t("Saving…") : label}
    </Button>
  );
}

function CreateCategoryDialog({ kind }: { kind: CatalogKind }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(createCategoryAction, nullState);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm">
            <Plus />
            {t("New category")}
          </Button>
        }
      />
      <DialogContent>
        <form action={formAction} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>{t("New category")}</DialogTitle>
          </DialogHeader>
          <input type="hidden" name="kind" value={kind} />
          {state !== nullState && !state.success ? (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>{state.error.message}</AlertDescription>
            </Alert>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="cat-name">{t("Name")}</Label>
            <Input id="cat-name" name="name" required />
          </div>
          <DialogFooter>
            <SubmitButton label={t("Create")} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CreateSubcategoryDialog({
  kind,
  categories,
}: {
  kind: CatalogKind;
  categories: { id: string; name: string }[];
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(createSubcategoryAction, nullState);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" variant="outline">
            <Plus />
            {t("New subcategory")}
          </Button>
        }
      />
      <DialogContent>
        <form action={formAction} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>{t("New subcategory")}</DialogTitle>
          </DialogHeader>
          <input type="hidden" name="kind" value={kind} />
          {state !== nullState && !state.success ? (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>{state.error.message}</AlertDescription>
            </Alert>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="subcat-category">{t("Category")}</Label>
            <Select name="categoryId" required>
              <SelectTrigger id="subcat-category" className="w-full">
                <SelectValue placeholder={t("Choose a category")} />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="subcat-name">{t("Name")}</Label>
            <Input id="subcat-name" name="name" required />
          </div>
          <DialogFooter>
            <SubmitButton label={t("Create")} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export interface CategoryWithSubcategories {
  id: string;
  name: string;
  subcategories: { id: string; name: string }[];
}

export function CategoryManager({
  kind,
  categories,
}: {
  kind: CatalogKind;
  categories: CategoryWithSubcategories[];
}) {
  const t = useT();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <CreateCategoryDialog kind={kind} />
        {categories.length > 0 ? (
          <CreateSubcategoryDialog kind={kind} categories={categories} />
        ) : null}
      </div>

      {categories.length === 0 ? (
        <EmptyState
          icon={FolderTree}
          title={t("No categories yet")}
          description={t("Create the first category to organize listings.")}
        />
      ) : (
        <div className="space-y-3">
          {categories.map((category) => (
            <div key={category.id} className="rounded-lg border p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{category.name}</p>
                <ConfirmationDialog
                  trigger={
                    <Button variant="ghost" size="sm" aria-label={t("Remove category")}>
                      <Trash2 />
                      {t("Remove")}
                    </Button>
                  }
                  title={t("Remove this category?")}
                  description={t(
                    "It is taken off the list. A category with subcategories or listings can't be removed.",
                  )}
                  action={removeCategoryAction}
                  hiddenFields={{ kind, id: category.id }}
                  confirmLabel={t("Remove")}
                  successMessage={t("Category removed")}
                  variant="destructive"
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {category.subcategories.length === 0 ? (
                  <span className="text-muted-foreground text-xs">{t("No subcategories")}</span>
                ) : (
                  category.subcategories.map((sub) => (
                    <Badge key={sub.id} variant="secondary" className="gap-1 pr-1">
                      {sub.name}
                      <ConfirmationDialog
                        trigger={
                          <button
                            type="button"
                            aria-label={t("Remove subcategory {name}", { name: sub.name })}
                            className="hover:bg-foreground/10 rounded-sm p-0.5"
                          >
                            <X className="size-3" />
                          </button>
                        }
                        title={t("Remove this subcategory?")}
                        description={t(
                          "It is taken off the list. A subcategory that listings still use can't be removed.",
                        )}
                        action={removeSubcategoryAction}
                        hiddenFields={{ kind, id: sub.id }}
                        confirmLabel={t("Remove")}
                        successMessage={t("Subcategory removed")}
                        variant="destructive"
                      />
                    </Badge>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
