"use client";

import { useT } from "@/i18n/provider";
import { useState } from "react";
import { useActionState } from "@/lib/use-action-state";
import { useFormStatus } from "react-dom";
import { AlertCircle, Plus } from "lucide-react";
import {
  createAnnouncementAction,
  type AnnouncementOutcome,
} from "@/server/services/announcement-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { FormField } from "@/components/ui/form-field";
import { FormGrid, FULL_ROW } from "@/components/ui/form-grid";
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
import { ANNOUNCEMENT_AUDIENCES, AUDIENCE_LABELS } from "@/lib/schemas/announcement";
import type { ApiResult } from "@/lib/api-response";
import type { FieldErrors } from "@/components/ui/action-form";

const initialState: ApiResult<AnnouncementOutcome> = {
  success: true,
  data: null as unknown as AnnouncementOutcome,
  meta: { requestId: "" },
};

function SubmitButton({ needsApproval }: { needsApproval: boolean }) {
  const t = useT();
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? t("Saving…") : needsApproval ? t("Send for approval") : t("Publish now")}
    </Button>
  );
}

export function AnnouncementDialog({ needsApproval }: { needsApproval: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(
    async (
      prev: ApiResult<AnnouncementOutcome>,
      formData: FormData,
    ): Promise<ApiResult<AnnouncementOutcome>> => {
      const result = await createAnnouncementAction(prev, formData);
      if (result.success) {
        setOpen(false);
        toast.success(
          result.data.mode === "SUBMITTED"
            ? "Sent to a Super Admin to publish"
            : "Announcement published",
        );
      }
      return result;
    },
    initialState,
  );
  const submitted = state !== initialState;
  const errors: FieldErrors =
    submitted && !state.success
      ? ((state.error.details as { fieldErrors?: FieldErrors } | undefined)?.fieldErrors ?? {})
      : {};

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button>
            <Plus />
            {t("New announcement")}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-xl">
        <form action={formAction} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>{t("New announcement")}</DialogTitle>
            <DialogDescription>
              {needsApproval
                ? t("It shows on members' dashboards once a Super Admin publishes it.")
                : t("It shows at the top of members' dashboards as soon as you publish.")}
            </DialogDescription>
          </DialogHeader>

          {submitted && !state.success ? (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>{state.error.message}</AlertDescription>
            </Alert>
          ) : null}

          <FormGrid>
            <FormField
              htmlFor="an-title"
              label={t("Title")}
              error={errors["title"]}
              className={FULL_ROW}
            >
              <Input id="an-title" name="title" maxLength={100} required />
            </FormField>
            <FormField
              htmlFor="an-body"
              label={t("Message")}
              error={errors["body"]}
              className={FULL_ROW}
            >
              <Textarea id="an-body" name="body" rows={4} maxLength={1000} required />
            </FormField>
            <FormField
              htmlFor="an-audience"
              label={t("Who should see it")}
              error={errors["audience"]}
            >
              <NativeSelect id="an-audience" name="audience" defaultValue="ALL">
                {ANNOUNCEMENT_AUDIENCES.map((a) => (
                  <option key={a} value={a}>
                    {AUDIENCE_LABELS[a]}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          </FormGrid>

          <DialogFooter>
            <SubmitButton needsApproval={needsApproval} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
