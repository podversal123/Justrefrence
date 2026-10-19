"use client";

import { useT } from "@/i18n/provider";
import { useState, useTransition } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  confirmTwoStepEnrollmentAction,
  startTwoStepEnrollmentAction,
  type EnrollmentStart,
} from "@/server/services/two-step-actions";
import { CodeForm } from "./code-form";

/** Set-up: scan the QR code with an authenticator app, then type the first code to prove it works. */
export function EnrollPanel({ next }: { next?: string }) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [start, setStart] = useState<EnrollmentStart | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!start) {
    return (
      <div className="space-y-4">
        {error ? (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertDescription>{t(error)}</AlertDescription>
          </Alert>
        ) : null}
        <p className="text-muted-foreground text-sm">
          {t(
            "You will need an authenticator app on your phone, such as Google Authenticator, Microsoft Authenticator or Authy.",
          )}
        </p>
        <Button
          type="button"
          className="w-full"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await startTwoStepEnrollmentAction();
              if (result.success) {
                setError(null);
                setStart(result.data);
              } else {
                setError(result.error.message);
              }
            })
          }
        >
          {pending ? t("Preparing…") : t("Set up two-step login")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ol className="text-muted-foreground list-decimal space-y-1 pl-5 text-sm">
        <li>{t("Open your authenticator app and add a new account.")}</li>
        <li>{t("Scan this picture, or type the key below instead.")}</li>
        <li>{t("Type the 6-digit code your app shows.")}</li>
      </ol>
      {/* eslint-disable-next-line @next/next/no-img-element -- a generated data: image, nothing to optimise */}
      <img
        src={start.qrSrc}
        alt={t("QR code for your authenticator app")}
        width={200}
        height={200}
        className="mx-auto rounded-lg border bg-white p-2"
      />
      <p className="text-center text-xs">
        <span className="text-muted-foreground">{t("Key")}: </span>
        <span className="font-mono break-all select-all">{start.secret}</span>
      </p>
      <CodeForm
        action={confirmTwoStepEnrollmentAction}
        next={next}
        factorId={start.factorId}
        submitLabel={t("Turn on two-step login")}
      />
    </div>
  );
}
