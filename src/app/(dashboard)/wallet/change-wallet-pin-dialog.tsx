"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { useT } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { ActionForm } from "@/components/ui/action-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { changeWalletPinAction } from "@/server/services/wallet-actions";

/** Change the wallet PIN: the current PIN is asked for, then the new one twice. */
export function ChangeWalletPinDialog() {
  const t = useT();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <KeyRound />
            {t("Change PIN")}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Change wallet PIN")}</DialogTitle>
          <DialogDescription>
            {t("Enter your current PIN, then choose a new 6-digit PIN.")}
          </DialogDescription>
        </DialogHeader>
        <ActionForm
          action={changeWalletPinAction}
          submitLabel={t("Change PIN")}
          pendingLabel={t("Saving…")}
          successMessage={t("Wallet PIN changed")}
          onSuccess={() => setOpen(false)}
        >
          {(errors) => (
            <div className="space-y-4">
              <FormField htmlFor="cp-current" label={t("Current PIN")} error={errors["currentPin"]}>
                <Input
                  id="cp-current"
                  name="currentPin"
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  autoComplete="off"
                  required
                />
              </FormField>
              <FormField htmlFor="cp-new" label={t("New 6-digit PIN")} error={errors["pin"]}>
                <Input
                  id="cp-new"
                  name="pin"
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  autoComplete="off"
                  required
                />
              </FormField>
              <FormField
                htmlFor="cp-confirm"
                label={t("Confirm new PIN")}
                error={errors["confirmPin"]}
              >
                <Input
                  id="cp-confirm"
                  name="confirmPin"
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  autoComplete="off"
                  required
                />
              </FormField>
            </div>
          )}
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
