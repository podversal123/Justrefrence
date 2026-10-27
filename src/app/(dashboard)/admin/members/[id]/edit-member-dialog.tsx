"use client";

import { useT } from "@/i18n/provider";
import { useState } from "react";
import { useActionState } from "@/lib/use-action-state";
import { useFormStatus } from "react-dom";
import { AlertCircle, Pencil } from "lucide-react";
import {
  updateMemberByAdminAction,
  type ChangeOutcome,
} from "@/server/services/admin-member-actions";
import { FULL_ROW, FormGrid } from "@/components/ui/form-grid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
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

const initialState: ApiResult<ChangeOutcome> = {
  success: true,
  data: null as unknown as ChangeOutcome,
  meta: { requestId: "" },
};

function SubmitButton({ needsApproval }: { needsApproval: boolean }) {
  const t = useT();
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? t("Saving…") : needsApproval ? t("Submit for approval") : t("Save changes")}
    </Button>
  );
}

export interface EditableMember {
  userId: string;
  fullName: string;
  /** YYYY-MM-DD or "" */
  dob: string;
  pan: string;
  gstin: string;
  websiteUrl: string;
  socialLinks: string;
  telephone: string;
}

/** Admin Panel, "Edit Member Profile": same fields the member can edit, with an audit entry. */
export function EditMemberDialog({
  member,
  needsApproval,
  defaultOpen = false,
}: {
  member: EditableMember;
  /** Opens the form as soon as the page loads (the Members menu's "Edit member profile"). */
  defaultOpen?: boolean;
  /** True for an Admin: the change goes to a Super Admin instead of being saved straight away. */
  needsApproval: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(defaultOpen);
  const [state, formAction] = useActionState(
    async (
      prev: ApiResult<ChangeOutcome>,
      formData: FormData,
    ): Promise<ApiResult<ChangeOutcome>> => {
      const result = await updateMemberByAdminAction(prev, formData);
      if (result.success) {
        setOpen(false);
        toast.success(
          result.data.mode === "SUBMITTED"
            ? "Sent to a Super Admin for approval"
            : "Member profile updated",
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
            {t("Edit profile")}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-xl">
        <form action={formAction} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>{t("Edit member profile")}</DialogTitle>
            <DialogDescription>
              {needsApproval
                ? t(
                    "A Super Admin will review your change. The profile stays as it is until they approve it.",
                  )
                : t("Changes are saved straight away and recorded in the audit log.")}
            </DialogDescription>
          </DialogHeader>

          {submitted && !state.success ? (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>{state.error.message}</AlertDescription>
            </Alert>
          ) : null}

          <input type="hidden" name="userId" value={member.userId} />

          <FormGrid>
            <FormField htmlFor="em-fullName" label={t("Full name")} error={errors["fullName"]}>
              <Input id="em-fullName" name="fullName" defaultValue={member.fullName} required />
            </FormField>
            <FormField htmlFor="em-dob" label={t("Date of birth")} error={errors["dob"]}>
              <Input id="em-dob" name="dob" type="date" defaultValue={member.dob} />
            </FormField>
            <FormField htmlFor="em-pan" label={t("PAN")} error={errors["pan"]}>
              <Input
                id="em-pan"
                name="pan"
                defaultValue={member.pan}
                placeholder={t("ABCDE1234F")}
              />
            </FormField>
            <FormField htmlFor="em-gstin" label={t("GSTIN")} error={errors["gstin"]}>
              <Input id="em-gstin" name="gstin" defaultValue={member.gstin} />
            </FormField>
            <FormField htmlFor="em-telephone" label={t("Telephone")} error={errors["telephone"]}>
              <Input
                id="em-telephone"
                name="telephone"
                type="tel"
                defaultValue={member.telephone}
                placeholder="011-23456789"
              />
            </FormField>
            <FormField htmlFor="em-website" label={t("Website")} error={errors["websiteUrl"]}>
              <Input
                id="em-website"
                name="websiteUrl"
                defaultValue={member.websiteUrl}
                placeholder="https://"
              />
            </FormField>
            <FormField
              htmlFor="em-social"
              label={t("Social links")}
              error={errors["socialLinks"]}
              className={FULL_ROW}
            >
              <Textarea
                id="em-social"
                name="socialLinks"
                rows={2}
                defaultValue={member.socialLinks}
              />
            </FormField>
          </FormGrid>

          {needsApproval ? (
            <FormField htmlFor="em-note" label={t("Why are you changing this? (optional)")}>
              <Textarea
                id="em-note"
                name="note"
                rows={2}
                maxLength={500}
                placeholder={t("A short note helps the Super Admin decide faster.")}
              />
            </FormField>
          ) : null}

          <DialogFooter>
            <SubmitButton needsApproval={needsApproval} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
