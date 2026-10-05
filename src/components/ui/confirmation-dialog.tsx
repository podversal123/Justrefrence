"use client";

import { useActionState, useEffect, useRef, useState } from "react";
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
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending}>
      {pending ? "Working…" : label}
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
  confirmLabel = "Confirm",
  variant = "default",
  successMessage,
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
}) {
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
    if (messageAtSubmit.current) toast.success(messageAtSubmit.current);
    setOpen(false);
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

          {state !== nullState && !state.success ? (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>{state.error.message}</AlertDescription>
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
