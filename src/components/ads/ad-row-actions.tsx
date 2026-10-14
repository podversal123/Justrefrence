"use client";

import { useT } from "@/i18n/provider";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Check, Eye, EyeOff, Trash2, X } from "lucide-react";
import {
  approveAdAction,
  deleteAdAction,
  rejectAdAction,
  toggleAdAction,
} from "@/server/services/ad-actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { ActionFormDialog } from "@/components/ui/action-form";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { toast } from "@/components/ui/toast";
import type { ApiResult } from "@/lib/api-response";

type Action = (prev: unknown, formData: FormData) => Promise<ApiResult<null>>;

/** Runs an ad action and reports the outcome the moment the server answers. */
function useRun(action: Action, adId: string) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (message: string) =>
    start(async () => {
      const formData = new FormData();
      formData.set("adId", adId);
      const result = await action(undefined, formData);
      if (!result.success) toast.error(t("Could not do that"), t(result.error.message));
      else {
        toast.success(message);
        router.refresh();
      }
    });
  return { pending, run };
}

/** What a vendor can do with their own ad: pause or resume an approved one, or delete it. */
export function VendorAdActions({
  adId,
  headline,
  canPause,
  isActive,
}: {
  adId: string;
  headline: string;
  canPause: boolean;
  isActive: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const toggle = useRun(toggleAdAction, adId);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {canPause ? (
        <Button
          variant="outline"
          size="sm"
          disabled={toggle.pending}
          onClick={() => toggle.run(isActive ? "Ad paused" : "Ad is showing again")}
        >
          {isActive ? <EyeOff /> : <Eye />}
          {isActive ? t("Pause") : t("Resume")}
        </Button>
      ) : null}
      <ConfirmationDialog
        trigger={
          <Button variant="outline" size="icon-sm">
            <Trash2 />
            <span className="sr-only">{t("Delete")}</span>
          </Button>
        }
        title={t("Delete this ad?")}
        description={`"${headline}" and its photo will be removed. This cannot be undone.`}
        action={async (prev, formData) => {
          const result = await deleteAdAction(prev, formData);
          if (result.success) {
            toast.success(t("Ad deleted"));
            router.refresh();
          }
          return result;
        }}
        hiddenFields={{ adId }}
        confirmLabel={t("Delete")}
        variant="destructive"
      />
    </div>
  );
}

/** What staff can do with an ad: approve one that is waiting, or turn down any that is not already turned down. */
export function ReviewAdActions({
  adId,
  canApprove,
  canReject,
}: {
  adId: string;
  canApprove: boolean;
  canReject: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const approve = useRun(approveAdAction, adId);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {canApprove ? (
        <Button size="sm" disabled={approve.pending} onClick={() => approve.run("Ad approved")}>
          <Check />
          {t("Approve")}
        </Button>
      ) : null}
      {canReject ? (
        <ActionFormDialog
          trigger={
            <Button variant="outline" size="sm" type="button">
              <X />
              {t("Turn down")}
            </Button>
          }
          title={t("Turn down this ad?")}
          description={t(
            "The vendor is told, and sees your reason. A showing ad is taken off the home page.",
          )}
          action={rejectAdAction}
          submitLabel={t("Turn down")}
          pendingLabel={t("Saving…")}
          successMessage={t("Ad turned down")}
          onSuccess={() => router.refresh()}
        >
          {(errors) => (
            <>
              <input type="hidden" name="adId" value={adId} />
              <FormField
                htmlFor={`ad-reason-${adId}`}
                label={t("Reason")}
                hint={t("Say what to change, so the vendor can fix it and send it again.")}
                error={errors["reason"]}
              >
                <Textarea
                  id={`ad-reason-${adId}`}
                  name="reason"
                  rows={3}
                  maxLength={300}
                  required
                />
              </FormField>
            </>
          )}
        </ActionFormDialog>
      ) : null}
    </div>
  );
}
