"use client";

import { msg } from "@/i18n/locales";
import { useT } from "@/i18n/provider";
import { useEffect, useRef, useState } from "react";
import { useActionState } from "@/lib/use-action-state";
import { useFormStatus } from "react-dom";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
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

const nullState: ApiResult<null> = { success: true, data: null, meta: { requestId: "" } };

function ConfirmButton({ label, variant }: { label: string; variant: "default" | "destructive" }) {
  const t = useT();
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending}>
      {pending ? t("Working…") : t(label)}
    </Button>
  );
}

/**
 * Generic "are you sure" dialog wrapping a Server Action form — used for
 * every destructive/irreversible-feeling catalog action (delete, reject).
 * See the Phase 3 brief's "ConfirmationDialog" reusable-component
 * requirement; also reusable outside catalog (any Server Action + hidden
 * fields fits this shape).
 */
export function ConfirmationDialog({
  trigger,
  title,
  description,
  action,
  hiddenFields,
  confirmLabel = msg("Confirm"),
  variant = "default",
  successMessage,
  children,
}: {
  trigger: React.ReactElement;
  title: string;
  description?: string;
  action: (prevState: unknown, formData: FormData) => Promise<ApiResult<null>>;
  hiddenFields: Record<string, string>;
  confirmLabel?: string;
  variant?: "default" | "destructive";
  /** Optional toast on success (callers that raise their own toast leave this out). */
  successMessage?: string;
  /** Extra fields shown inside the form (for example a reason box). */
  children?: React.ReactNode;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(action, nullState);
  const handled = useRef<string | null>(null);
  // Captured at submit: a revalidation re-renders the caller with new props
  // (e.g. the trigger flips Deactivate -> Reactivate) before this effect runs.
  const messageAtSubmit = useRef(successMessage);

  // Close once the action succeeds. Without this the dialog stayed open over
  // the page (the trigger often re-renders into a different button after a
  // revalidation), inviting a second confirm that then failed as a conflict.
  useEffect(() => {
    if (state === nullState || !state.success) return;
    if (handled.current === state.meta.requestId) return;
    handled.current = state.meta.requestId;
    if (messageAtSubmit.current) toast.success(t(messageAtSubmit.current));
    setOpen(false);
    // `t` is left out on purpose: this runs once per result (guarded by the request id), and a
    // language switch must not show the toast again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <form
          action={formAction}
          onSubmit={() => {
            messageAtSubmit.current = successMessage;
          }}
          className="space-y-4"
          noValidate
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>

          {Object.entries(hiddenFields).map(([key, value]) => (
            <input key={key} type="hidden" name={key} value={value} />
          ))}

          {children}

          {state !== nullState && !state.success ? (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>{t(state.error.message)}</AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter>
            <ConfirmButton label={confirmLabel} variant={variant} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
