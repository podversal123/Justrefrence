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

export type FieldErrors = Record<string, string[] | undefined>;

type ServerAction<T> = (prevState: unknown, formData: FormData) => Promise<ApiResult<T>>;

function fieldErrorsOf<T>(state: ApiResult<T> | null): FieldErrors {
  if (!state || state.success) return {};
  const details = state.error.details as { fieldErrors?: FieldErrors } | undefined;
  return details?.fieldErrors ?? {};
}

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const t = useT();
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? t(pendingLabel) : t(label)}
    </Button>
  );
}

/**
 * Standard Server-Action form: pending button, inline error alert, per-field
 * errors (passed to `children` as a render prop), success toast, and form
 * reset. Used by the support, messaging, blog, feedback and moderation
 * screens so they all behave the same way.
 */
export function ActionForm<T>({
  action,
  submitLabel,
  pendingLabel = msg("Working…"),
  successMessage,
  resetOnSuccess = true,
  onSuccess,
  className,
  footer,
  children,
}: {
  action: ServerAction<T>;
  submitLabel: string;
  pendingLabel?: string;
  successMessage: string;
  resetOnSuccess?: boolean;
  onSuccess?: (data: T) => void;
  className?: string;
  /** Rendered next to the submit button (e.g. a secondary link). */
  footer?: React.ReactNode;
  children: React.ReactNode | ((errors: FieldErrors) => React.ReactNode);
}) {
  const t = useT();
  const [state, formAction] = useActionState<ApiResult<T> | null, FormData>(
    (prev, formData) => action(prev, formData),
    null,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const handled = useRef<string | null>(null);
  // The success message is captured when the form is SUBMITTED. A Server
  // Action that calls revalidatePath() returns fresh props in the same
  // render as its result, so a message derived from props (e.g. "Member
  // blocked" vs "Member allowed" keyed off the member's current status)
  // would otherwise already describe the NEW state by the time it shows.
  const messageAtSubmit = useRef(successMessage);

  useEffect(() => {
    if (!state?.success) return;
    if (handled.current === state.meta.requestId) return;
    handled.current = state.meta.requestId;
    toast.success(t(messageAtSubmit.current));
    if (resetOnSuccess) formRef.current?.reset();
    onSuccess?.(state.data);
    // `t` is left out on purpose: this runs once per result (guarded by the request id), and a
    // language switch must not show the toast again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, resetOnSuccess, onSuccess]);

  const errors = fieldErrorsOf(state);

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={() => {
        messageAtSubmit.current = successMessage;
      }}
      className={className ?? "space-y-4"}
      noValidate
    >
      {state && !state.success ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>{t(state.error.message)}</AlertDescription>
        </Alert>
      ) : null}
      {typeof children === "function" ? children(errors) : children}
      <div className="flex items-center gap-3">
        <SubmitButton label={submitLabel} pendingLabel={pendingLabel} />
        {footer}
      </div>
    </form>
  );
}

/** ActionForm inside a dialog that closes itself on success. */
export function ActionFormDialog<T>({
  trigger,
  title,
  description,
  action,
  submitLabel,
  pendingLabel,
  successMessage,
  onSuccess,
  defaultOpen = false,
  children,
}: {
  trigger: React.ReactElement;
  /** Opens as soon as the page loads (a menu link that means "start a new one"). */
  defaultOpen?: boolean;
  title: string;
  description?: string;
  action: ServerAction<T>;
  submitLabel: string;
  pendingLabel?: string;
  successMessage: string;
  onSuccess?: (data: T) => void;
  children: React.ReactNode | ((errors: FieldErrors) => React.ReactNode);
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <ActionForm
          action={action}
          submitLabel={submitLabel}
          pendingLabel={pendingLabel}
          successMessage={successMessage}
          onSuccess={(data) => {
            setOpen(false);
            onSuccess?.(data);
          }}
        >
          {children}
        </ActionForm>
        <DialogFooter className="sr-only" />
      </DialogContent>
    </Dialog>
  );
}
