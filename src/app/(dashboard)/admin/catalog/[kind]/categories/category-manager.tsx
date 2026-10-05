"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, FolderTree, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import { createCategoryAction, createSubcategoryAction } from "@/server/services/catalog-actions";
import type { CatalogKind } from "@/server/domain/catalog/types";
import type { ApiResult } from "@/lib/api-response";

const nullState: ApiResult<{ id: string }> = {
  success: true,
  data: null as unknown as { id: string },
  meta: { requestId: "" },
};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

function CreateCategoryDialog({ kind }: { kind: CatalogKind }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(createCategoryAction, nullState);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm">
            <Plus />
            New category
          </Button>
        }
      />
      <DialogContent>
        <form action={formAction} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>New category</DialogTitle>
          </DialogHeader>
          <input type="hidden" name="kind" value={kind} />
          {state !== nullState && !state.success ? (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>{state.error.message}</AlertDescription>
            </Alert>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="cat-name">Name</Label>
            <Input id="cat-name" name="name" required />
          </div>
          <DialogFooter>
            <SubmitButton label="Create" />
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
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(createSubcategoryAction, nullState);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" variant="outline">
            <Plus />
            New subcategory
          </Button>
        }
      />
      <DialogContent>
        <form action={formAction} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>New subcategory</DialogTitle>
          </DialogHeader>
          <input type="hidden" name="kind" value={kind} />
          {state !== nullState && !state.success ? (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>{state.error.message}</AlertDescription>
            </Alert>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="subcat-category">Category</Label>
            <Select name="categoryId" required>
              <SelectTrigger id="subcat-category" className="w-full">
                <SelectValue placeholder="Choose a category" />
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
            <Label htmlFor="subcat-name">Name</Label>
            <Input id="subcat-name" name="name" required />
          </div>
          <DialogFooter>
            <SubmitButton label="Create" />
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
          title="No categories yet"
          description="Create the first category to organize listings."
        />
      ) : (
        <div className="space-y-3">
          {categories.map((category) => (
            <div key={category.id} className="rounded-lg border p-4">
              <p className="font-medium">{category.name}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {category.subcategories.length === 0 ? (
                  <span className="text-muted-foreground text-xs">No subcategories</span>
                ) : (
                  category.subcategories.map((sub) => (
                    <Badge key={sub.id} variant="secondary">
                      {sub.name}
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
