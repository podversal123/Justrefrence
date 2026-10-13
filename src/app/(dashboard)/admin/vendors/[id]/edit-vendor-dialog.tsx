"use client";

import { useState } from "react";
import { useActionState } from "@/lib/use-action-state";
import { useFormStatus } from "react-dom";
import { AlertCircle, Pencil } from "lucide-react";
import {
  updateVendorByAdminAction,
  type VendorChangeOutcome,
} from "@/server/services/vendor-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { FormGrid, FULL_ROW } from "@/components/ui/form-grid";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "@/components/ui/toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { ApiResult } from "@/lib/api-response";
import type { FieldErrors } from "@/components/ui/action-form";

const initialState: ApiResult<VendorChangeOutcome> = {
  success: true,
  data: null as unknown as VendorChangeOutcome,
  meta: { requestId: "" },
};

function SubmitButton({ needsApproval }: { needsApproval: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : needsApproval ? "Submit for approval" : "Save changes"}
    </Button>
  );
}

export interface EditableVendor {
  vendorProfileId: string;
  businessName: string;
  phone: string;
  telephone: string;
  gstin: string;
  pan: string;
}

/** Admin edit of a vendor's business details. An Admin's change goes to a Super Admin for approval. */
export function EditVendorDialog({
  vendor,
  needsApproval,
}: {
  vendor: EditableVendor;
  needsApproval: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(
    async (
      prev: ApiResult<VendorChangeOutcome>,
      formData: FormData,
    ): Promise<ApiResult<VendorChangeOutcome>> => {
      const result = await updateVendorByAdminAction(prev, formData);
      if (result.success) {
        setOpen(false);
        toast.success(
          result.data.mode === "SUBMITTED"
            ? "Sent to a Super Admin for approval"
            : "Vendor details updated",
        );
      }
      return result;
    },
    initialState,
  );
  const submitted = state !== initialState;
  const errors: FieldErrors =
    submitted && !state.success
      ? ((state.error.details as { fieldErrors?: FieldErrors } | undefined)?.fieldErrors ?? {})
      : {};

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline">
            <Pencil />
            Edit details
          </Button>
        }
      />
      <DialogContent className="sm:max-w-xl">
        <form action={formAction} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>Edit vendor details</DialogTitle>
            <DialogDescription>
              {needsApproval
                ? "A Super Admin will review your change. The vendor's details stay as they are until they approve it."
                : "Changes are saved straight away and recorded in the audit log."}
            </DialogDescription>
          </DialogHeader>

          {submitted && !state.success ? (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>{state.error.message}</AlertDescription>
            </Alert>
          ) : null}

          <input type="hidden" name="vendorProfileId" value={vendor.vendorProfileId} />

          <FormGrid>
            <FormField
              htmlFor="ev-businessName"
              label="Business name"
              error={errors["businessName"]}
              className={FULL_ROW}
            >
              <Input
                id="ev-businessName"
                name="businessName"
                defaultValue={vendor.businessName}
                required
              />
            </FormField>
            <FormField htmlFor="ev-phone" label="Business mobile" error={errors["phone"]}>
              <Input
                id="ev-phone"
                name="phone"
                type="tel"
                defaultValue={vendor.phone}
                placeholder="+919876543210"
                required
              />
            </FormField>
            <FormField htmlFor="ev-telephone" label="Telephone" error={errors["telephone"]}>
              <Input
                id="ev-telephone"
                name="telephone"
                type="tel"
                defaultValue={vendor.telephone}
                placeholder="011-23456789"
              />
            </FormField>
            <FormField htmlFor="ev-gstin" label="GSTIN" error={errors["gstin"]}>
              <Input id="ev-gstin" name="gstin" defaultValue={vendor.gstin} />
            </FormField>
            <FormField htmlFor="ev-pan" label="Business PAN" error={errors["pan"]}>
              <Input id="ev-pan" name="pan" defaultValue={vendor.pan} placeholder="ABCDE1234F" />
            </FormField>
            {needsApproval ? (
              <FormField
                htmlFor="ev-note"
                label="Why are you changing this? (optional)"
                className={FULL_ROW}
              >
                <Textarea
                  id="ev-note"
                  name="note"
                  rows={2}
                  maxLength={500}
                  placeholder="A short note helps the Super Admin decide faster."
                />
              </FormField>
            ) : null}
          </FormGrid>

          <DialogFooter>
            <SubmitButton needsApproval={needsApproval} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
