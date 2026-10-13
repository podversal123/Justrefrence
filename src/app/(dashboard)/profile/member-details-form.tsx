"use client";

import { useActionState } from "@/lib/use-action-state";
import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { updateMemberDetailsAction } from "@/server/services/member-actions";
import { FULL_ROW, FormGrid } from "@/components/ui/form-grid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { maskPan } from "@/server/domain/identity/masking";
import type { ApiResult } from "@/lib/api-response";

const initialState: ApiResult<null> = { success: true, data: null, meta: { requestId: "" } };

function toDateInputValue(date: Date | null): string {
  if (!date) return "";
  return date.toISOString().slice(0, 10);
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Save details"}
    </Button>
  );
}

export function MemberDetailsForm({
  fullName,
  dob,
  pan,
  gstin,
  websiteUrl,
  socialLinks,
  telephone,
}: {
  fullName: string | null;
  dob: Date | null;
  pan: string | null;
  gstin: string | null;
  websiteUrl: string | null;
  socialLinks: string | null;
  telephone: string | null;
}) {
  const [state, formAction] = useActionState(updateMemberDetailsAction, initialState);
  const submitted = state !== initialState;

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {submitted && !state.success ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>{state.error.message}</AlertDescription>
        </Alert>
      ) : null}
      {submitted && state.success ? (
        <Alert>
          <CheckCircle2 className="size-4" />
          <AlertDescription>Member details updated.</AlertDescription>
        </Alert>
      ) : null}

      <input type="hidden" name="fullName" value={fullName ?? ""} />

      <FormGrid>
        <div className="space-y-2">
          <Label htmlFor="dob">Date of birth</Label>
          <Input id="dob" name="dob" type="date" defaultValue={toDateInputValue(dob)} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="pan">PAN</Label>
          <Input id="pan" name="pan" defaultValue={pan ?? ""} placeholder="ABCDE1234F" />
          {pan ? (
            <p className="text-muted-foreground text-xs">Currently on file: {maskPan(pan)}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="gstin">GSTIN</Label>
          <Input id="gstin" name="gstin" defaultValue={gstin ?? ""} placeholder="29ABCDE1234F1Z5" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="telephone">Telephone (optional)</Label>
          <Input
            id="telephone"
            name="telephone"
            type="tel"
            defaultValue={telephone ?? ""}
            placeholder="011-23456789"
          />
        </div>

        <div className={`space-y-2 ${FULL_ROW}`}>
          <Label htmlFor="websiteUrl">Website</Label>
          <Input
            id="websiteUrl"
            name="websiteUrl"
            type="url"
            defaultValue={websiteUrl ?? ""}
            placeholder="https://example.com"
          />
        </div>

        <div className={`space-y-2 ${FULL_ROW}`}>
          <Label htmlFor="socialLinks">Social links</Label>
          <Textarea
            id="socialLinks"
            name="socialLinks"
            defaultValue={socialLinks ?? ""}
            placeholder="One link per line"
            rows={2}
          />
        </div>
      </FormGrid>

      <SubmitButton />
    </form>
  );
}
