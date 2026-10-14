"use client";

import { useT } from "@/i18n/provider";
import { useActionState } from "@/lib/use-action-state";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { requestRegistrationAction } from "@/server/services/member-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ApiResult } from "@/lib/api-response";

const initialState: ApiResult<null> = { success: true, data: null, meta: { requestId: "" } };

function SubmitButton() {
  const t = useT();
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? t("Creating account…") : t("Create account")}
    </Button>
  );
}

export function RegisterForm({ initialReferralCode }: { initialReferralCode?: string }) {
  const t = useT();
  const [state, formAction] = useActionState(requestRegistrationAction, initialState);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {!state.success ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>{t(state.error.message)}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="fullName">{t("Full name")}</Label>
        <Input id="fullName" name="fullName" autoComplete="name" required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">{t("Email")}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder={t("you@example.com")}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">{t("Mobile number")}</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          required
          placeholder="+919876543210"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">{t("Password")}</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmPassword">{t("Confirm password")}</Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="channel">{t("Verify via")}</Label>
        <Select name="channel" defaultValue="EMAIL" required>
          <SelectTrigger id="channel" className="w-full">
            <SelectValue placeholder={t("Choose a channel")}>
              {(value: string) =>
                value === "SMS" ? t("SMS") : value === "WHATSAPP" ? t("WhatsApp") : t("Email")
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="EMAIL">{t("Email")}</SelectItem>
            <SelectItem value="SMS">{t("SMS")}</SelectItem>
            <SelectItem value="WHATSAPP">{t("WhatsApp")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="referralCode">{t("Referral code (optional)")}</Label>
        <Input
          id="referralCode"
          name="referralCode"
          defaultValue={initialReferralCode}
          placeholder="JR-000042"
        />
      </div>

      <SubmitButton />

      <p className="text-muted-foreground text-center text-xs">
        {t("Already have an account?")}{" "}
        <Link href="/login" className="underline underline-offset-4">
          {t("Sign in")}
        </Link>
      </p>
    </form>
  );
}
