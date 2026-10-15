"use client";

import { useT } from "@/i18n/provider";
import { useState } from "react";
import { useActionState } from "@/lib/use-action-state";
import { useFormStatus } from "react-dom";
import { AlertCircle, Plus } from "lucide-react";
import { createVendorAction } from "@/server/services/vendor-actions";
import { FULL_ROW, FormGrid } from "@/components/ui/form-grid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
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

const initialState: ApiResult<{ userId: string }> = {
  success: true,
  data: null as unknown as { userId: string },
  meta: { requestId: "" },
};

function SubmitButton() {
  const t = useT();
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? t("Sending invite…") : t("Create vendor")}
    </Button>
  );
}

export function CreateVendorDialog() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(createVendorAction, initialState);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button>
            <Plus />
            {t("Create vendor")}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-xl">
        <form action={formAction} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>{t("Create vendor account")}</DialogTitle>
            <DialogDescription>
              {t("Sends an email invite. The vendor starts as Pending until you approve them.")}
            </DialogDescription>
          </DialogHeader>

          {state !== initialState && !state.success ? (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>{state.error.message}</AlertDescription>
            </Alert>
          ) : null}

          <FormGrid>
            <div className={`space-y-2 ${FULL_ROW}`}>
              <Label htmlFor="vendor-businessName">{t("Business name")}</Label>
              <Input id="vendor-businessName" name="businessName" required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="vendor-fullName">{t("Contact name")}</Label>
              <Input id="vendor-fullName" name="fullName" required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="vendor-phone">{t("Contact mobile")}</Label>
              <Input
                id="vendor-phone"
                name="phone"
                type="tel"
                placeholder="+919876543210"
                required
              />
            </div>

            <div className={`space-y-2 ${FULL_ROW}`}>
              <Label htmlFor="vendor-email">{t("Contact email")}</Label>
              <Input id="vendor-email" name="email" type="email" required />
              <p className="text-muted-foreground text-xs">
                {t("We send the invite here. The mobile number needs the country code.")}
              </p>
            </div>
          </FormGrid>

          <DialogFooter>
            <SubmitButton />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
