"use client";

import { useT } from "@/i18n/provider";
import { useRef } from "react";
import { useActionState } from "@/lib/use-action-state";
import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2, ExternalLink, Upload } from "lucide-react";
import { uploadKycDocumentAction } from "@/server/services/kyc-actions";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { StatusBadge } from "@/components/ui/status-badge";
import { MAX_UPLOAD_BYTES } from "@/lib/upload-limits";
import type { ApiResult } from "@/lib/api-response";

const initialState: ApiResult<null> = { success: true, data: null, meta: { requestId: "" } };

const ACCEPT = "application/pdf,image/jpeg,image/png,image/webp";

export interface KycDocumentView {
  id: string;
  status: "PENDING" | "VERIFIED" | "REJECTED";
  originalName: string;
  rejectedReason: string | null;
}

function UploadButton({ replacing }: { replacing: boolean }) {
  const t = useT();
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      <Upload />
      {pending ? t("Uploading…") : replacing ? t("Upload again") : t("Upload")}
    </Button>
  );
}

const STATUS_HELP: Record<KycDocumentView["status"], string> = {
  PENDING: "Waiting for our team to check it.",
  VERIFIED: "Verified.",
  REJECTED: "Needs to be uploaded again.",
};

/**
 * One document slot (PAN card, GST certificate): its status, what to fix if it was rejected, and
 * the upload control. Checks the file on the device first so a wrong file fails instantly, and
 * the server checks it again from its real contents.
 */
export function KycDocumentRow({
  type,
  label,
  hint,
  document,
}: {
  type: "PAN_CARD" | "GST_CERTIFICATE" | "INCORPORATION_CERTIFICATE";
  label: string;
  hint: string;
  document: KycDocumentView | null;
}) {
  const t = useT();
  const [state, formAction] = useActionState(uploadKycDocumentAction, initialState);
  const inputRef = useRef<HTMLInputElement>(null);
  const submitted = state !== initialState;
  const inputId = `kyc-${type}`;

  function checkFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file && file.size > MAX_UPLOAD_BYTES) {
      event.target.setCustomValidity("This file is too large. Use one up to 4MB.");
      event.target.reportValidity();
      event.target.value = "";
    } else {
      event.target.setCustomValidity("");
    }
  }

  return (
    <div className="space-y-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-0.5">
          <p className="font-medium">{label}</p>
          <p className="text-muted-foreground text-sm">{hint}</p>
        </div>
        {document ? <StatusBadge status={document.status} /> : null}
      </div>

      {document ? (
        <div className="bg-muted/50 flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm">
          <span className="min-w-0 truncate">{document.originalName}</span>
          <a
            href={`/api/kyc/${document.id}/file`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary inline-flex items-center gap-1 font-medium hover:underline"
          >
            {t("View")}
            <ExternalLink className="size-3.5" aria-hidden="true" />
          </a>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">{t("Not uploaded yet.")}</p>
      )}

      {document ? (
        <p className="text-sm">
          {document.status === "REJECTED" && document.rejectedReason
            ? `${STATUS_HELP.REJECTED} ${document.rejectedReason}`
            : STATUS_HELP[document.status]}
        </p>
      ) : null}

      {submitted && !state.success ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>{t(state.error.message)}</AlertDescription>
        </Alert>
      ) : null}
      {submitted && state.success ? (
        <Alert>
          <CheckCircle2 className="size-4" />
          <AlertDescription>{t("Uploaded. We will check it soon.")}</AlertDescription>
        </Alert>
      ) : null}

      {document?.status === "VERIFIED" ? null : (
        <form action={formAction} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="type" value={type} />
          <label htmlFor={inputId} className="sr-only">
            {t("{label} file", { label })}
          </label>
          <input
            ref={inputRef}
            id={inputId}
            name="file"
            type="file"
            accept={ACCEPT}
            required
            onChange={checkFile}
            className="file:bg-secondary file:text-secondary-foreground text-sm file:mr-3 file:rounded-md file:border-0 file:px-3 file:py-1.5 file:text-sm file:font-medium"
          />
          <UploadButton replacing={Boolean(document)} />
        </form>
      )}
    </div>
  );
}
