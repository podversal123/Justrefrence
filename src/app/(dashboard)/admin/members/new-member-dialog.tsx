"use client";

import { useT } from "@/i18n/provider";
import { useState } from "react";
import { useActionState } from "@/lib/use-action-state";
import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2, Copy, UserPlus } from "lucide-react";
import {
  createMemberByAdminAction,
  type RegisteredMemberResult,
} from "@/server/services/admin-member-actions";
import { FormGrid } from "@/components/ui/form-grid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

const initialState: ApiResult<RegisteredMemberResult> = {
  success: true,
  data: null as unknown as RegisteredMemberResult,
  meta: { requestId: "" },
};

function SubmitButton() {
  const t = useT();
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? t("Registering…") : t("Register member")}
    </Button>
  );
}

function fieldErrors(state: ApiResult<RegisteredMemberResult>): FieldErrors {
  if (state.success) return {};
  return (state.error.details as { fieldErrors?: FieldErrors } | undefined)?.fieldErrors ?? {};
}

/** Admin Panel, "New Registration": creates an active member and shows a one-time temporary password. */
export function NewMemberDialog() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(createMemberByAdminAction, initialState);
  const created = state !== initialState && state.success ? state.data : null;
  const errors = state !== initialState ? fieldErrors(state) : {};

  async function copyPassword() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.temporaryPassword);
      toast.success(t("Password copied"));
    } catch {
      toast.error(t("Could not copy. Select the password and copy it manually."));
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button>
            <UserPlus />
            {t("New registration")}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-xl">
        {created ? (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle>{t("Member registered")}</DialogTitle>
              <DialogDescription>
                {t("Share these sign-in details with the member. The password is shown only now.")}
              </DialogDescription>
            </DialogHeader>
            <Alert>
              <CheckCircle2 className="size-4" />
              <AlertDescription>
                {t("Member ID {id} created for {email}.", {
                  id: created.memberId,
                  email: created.email,
                })}
              </AlertDescription>
            </Alert>
            <dl className="bg-muted space-y-2 rounded-lg p-4 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t("Sign in with")}</dt>
                <dd className="font-medium">{created.email}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">{t("Temporary password")}</dt>
                <dd className="flex items-center gap-2 font-mono font-medium">
                  {created.temporaryPassword}
                  <Button type="button" size="icon" variant="ghost" onClick={copyPassword}>
                    <Copy />
                    <span className="sr-only">{t("Copy password")}</span>
                  </Button>
                </dd>
              </div>
            </dl>
            <p className="text-muted-foreground text-sm">
              {t("Ask the member to change it from their profile after signing in.")}
            </p>
            <DialogFooter>
              <Button type="button" onClick={() => setOpen(false)}>
                {t("Done")}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form action={formAction} className="space-y-4" noValidate>
            <DialogHeader>
              <DialogTitle>{t("New registration")}</DialogTitle>
              <DialogDescription>
                {t(
                  "Register a member on their behalf. They start as Active, with a temporary password you can share.",
                )}
              </DialogDescription>
            </DialogHeader>

            {state !== initialState && !state.success ? (
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertDescription>{state.error.message}</AlertDescription>
              </Alert>
            ) : null}

            <FormGrid>
              <FormField htmlFor="nm-fullName" label={t("Full name")} error={errors["fullName"]}>
                <Input id="nm-fullName" name="fullName" required />
              </FormField>
              <FormField htmlFor="nm-email" label={t("Email")} error={errors["email"]}>
                <Input id="nm-email" name="email" type="email" required />
              </FormField>
              <FormField htmlFor="nm-phone" label={t("Mobile (optional)")} error={errors["phone"]}>
                <Input id="nm-phone" name="phone" type="tel" placeholder="+919876543210" />
              </FormField>
              <FormField
                htmlFor="nm-referral"
                label={t("Referral ID (optional)")}
                error={errors["referralCode"]}
              >
                <Input
                  id="nm-referral"
                  name="referralCode"
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="1234567890"
                />
              </FormField>
            </FormGrid>

            <DialogFooter>
              <SubmitButton />
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
