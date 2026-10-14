"use client";

import { useT } from "@/i18n/provider";
import { useEffect, useState } from "react";
import { useActionState } from "@/lib/use-action-state";
import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FormField } from "@/components/ui/form-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { paiseToRupeesInput } from "@/lib/money";
import type { CatalogKind } from "@/server/domain/catalog/types";
import type { ApiResult } from "@/lib/api-response";

export interface CategoryOption {
  id: string;
  name: string;
  subcategories: { id: string; name: string }[];
}

export interface ListingFormInitialValues {
  id?: string;
  categoryId?: string;
  subcategoryId?: string | null;
  title?: string;
  description?: string | null;
  price?: string | null; // paise, as a string
  sku?: string | null;
  stock?: number;
  pricingType?: "FIXED" | "QUOTE";
}

type ListingActionResult =
  ApiResult<{ id: string }> | ApiResult<{ pendingApproval: boolean } | null> | ApiResult<null>;
type ListingAction = (prevState: unknown, formData: FormData) => Promise<ListingActionResult>;

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

/**
 * The shared create/edit form for all three catalog kinds — fields adapt to
 * `kind` (Product gets SKU/stock, Service gets pricing type, Project gets
 * neither) from one implementation. See docs/adr/0011-catalog-architecture.md
 * and the Phase 3 brief's "Form" reusable-component requirement.
 */
export function ListingForm({
  kind,
  action,
  categories,
  vendors,
  initialValues,
  submitLabel,
  onSuccess,
}: {
  kind: CatalogKind;
  action: ListingAction;
  categories: CategoryOption[];
  /** Present only for admin create — lets staff pick which vendor owns the new listing. */
  vendors?: { id: string; businessName: string }[];
  initialValues?: ListingFormInitialValues;
  submitLabel: string;
  /** Called once with the new/edited listing's id after a successful submit. */
  onSuccess?: (id: string) => void;
}) {
  const t = useT();
  const [state, formAction] = useActionState(action, nullState);
  const [categoryId, setCategoryId] = useState(initialValues?.categoryId ?? "");
  const [pricingType, setPricingType] = useState<"FIXED" | "QUOTE">(
    initialValues?.pricingType ?? "FIXED",
  );

  const waitingForApproval =
    state !== nullState &&
    state.success &&
    Boolean(state.data && typeof state.data === "object" && "pendingApproval" in state.data);

  useEffect(() => {
    if (waitingForApproval) return;
    if (
      state !== nullState &&
      state.success &&
      state.data &&
      typeof state.data === "object" &&
      "id" in state.data
    ) {
      onSuccess?.(state.data.id as string);
    } else if (state !== nullState && state.success && initialValues?.id) {
      onSuccess?.(initialValues.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onSuccess is expected to be referentially stable enough here; re-firing on identity change would be wrong anyway
  }, [state]);

  const selectedCategory = categories.find((c) => c.id === categoryId);
  const fieldErrors =
    state !== nullState && !state.success && state.error.code === "VALIDATION_ERROR"
      ? ((state.error.details as { fieldErrors?: Record<string, string[]> } | undefined)
          ?.fieldErrors ?? {})
      : {};

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <input type="hidden" name="kind" value={kind} />
      {initialValues?.id ? <input type="hidden" name="id" value={initialValues.id} /> : null}

      {waitingForApproval ? (
        <Alert>
          <CheckCircle2 className="size-4" />
          <AlertDescription>
            {t("Sent to a Super Admin for approval. The live listing stays as it is until then.")}
          </AlertDescription>
        </Alert>
      ) : null}

      {state !== nullState && !state.success ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>{t(state.error.message)}</AlertDescription>
        </Alert>
      ) : null}

      {vendors ? (
        <FormField htmlFor="vendorId" label={t("Vendor")}>
          <Select name="vendorId" required defaultValue={undefined}>
            <SelectTrigger id="vendorId" className="w-full">
              <SelectValue placeholder={t("Choose a vendor")} />
            </SelectTrigger>
            <SelectContent>
              {vendors.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.businessName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      ) : null}

      <FormField htmlFor="title" label={t("Title")} error={fieldErrors["title"]}>
        <Input id="title" name="title" defaultValue={initialValues?.title} required />
      </FormField>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField htmlFor="categoryId" label={t("Category")} error={fieldErrors["categoryId"]}>
          <Select
            name="categoryId"
            value={categoryId}
            onValueChange={(v) => setCategoryId(v ?? "")}
            required
          >
            <SelectTrigger id="categoryId" className="w-full">
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
        </FormField>

        <FormField htmlFor="subcategoryId" label={t("Subcategory (optional)")}>
          <Select
            name="subcategoryId"
            defaultValue={initialValues?.subcategoryId ?? undefined}
            disabled={!selectedCategory}
          >
            <SelectTrigger id="subcategoryId" className="w-full">
              <SelectValue
                placeholder={
                  selectedCategory ? t("Choose a subcategory") : t("Choose a category first")
                }
              />
            </SelectTrigger>
            <SelectContent>
              {selectedCategory?.subcategories.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      </div>

      <FormField htmlFor="description" label={t("Description")}>
        <Textarea
          id="description"
          name="description"
          rows={4}
          defaultValue={initialValues?.description ?? ""}
        />
      </FormField>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {kind === "SERVICE" ? (
          <FormField htmlFor="pricingType" label={t("Pricing")}>
            <Select
              name="pricingType"
              value={pricingType}
              onValueChange={(v) => setPricingType((v as "FIXED" | "QUOTE") ?? "FIXED")}
            >
              <SelectTrigger id="pricingType" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FIXED">{t("Fixed price")}</SelectItem>
                <SelectItem value="QUOTE">{t("Quote on request")}</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
        ) : null}

        {kind !== "SERVICE" || pricingType === "FIXED" ? (
          <FormField
            htmlFor="price"
            label={t("Price (₹)")}
            hint={t("In rupees, for example 1500 or 1499.50.")}
            error={fieldErrors["price"]}
          >
            <Input
              id="price"
              name="price"
              inputMode="decimal"
              placeholder="1500"
              defaultValue={paiseToRupeesInput(initialValues?.price)}
              required={kind !== "SERVICE" || pricingType === "FIXED"}
            />
          </FormField>
        ) : null}

        {kind === "PRODUCT" ? (
          <>
            <FormField htmlFor="sku" label={t("SKU (optional)")}>
              <Input id="sku" name="sku" defaultValue={initialValues?.sku ?? ""} />
            </FormField>
            <FormField htmlFor="stock" label={t("Stock")}>
              <Input
                id="stock"
                name="stock"
                type="number"
                min={0}
                defaultValue={initialValues?.stock ?? 0}
              />
            </FormField>
          </>
        ) : null}
      </div>

      <SubmitButton label={submitLabel} />
    </form>
  );
}
