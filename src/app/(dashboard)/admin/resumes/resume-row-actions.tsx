"use client";

import { useT } from "@/i18n/provider";
import { useRouter } from "next/navigation";
import { Download, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { deleteResumeAction, updateResumeStatusAction } from "@/server/services/careers-actions";

/** Download, mark as reviewed, and delete: the three things staff do with a résumé. */
export function ResumeRowActions({
  id,
  status,
  fileName,
}: {
  id: string;
  status: "NEW" | "REVIEWED";
  fileName: string;
}) {
  const t = useT();
  const router = useRouter();
  const reviewed = status === "REVIEWED";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <a
        href={`/api/resumes/${id}/file`}
        className={buttonVariants({ variant: "outline", size: "sm" })}
        aria-label={t("Download {name}", { name: fileName })}
      >
        <Download />
        {t("Download")}
      </a>
      <ConfirmationDialog
        trigger={
          <Button variant="outline" size="sm" type="button">
            {reviewed ? t("Mark as new") : t("Mark as reviewed")}
          </Button>
        }
        title={reviewed ? t("Mark this résumé as new again?") : t("Mark this résumé as reviewed?")}
        description={t("This only changes the label in this list.")}
        action={async (prev, formData) => {
          const result = await updateResumeStatusAction(prev, formData);
          if (result.success) router.refresh();
          return result;
        }}
        hiddenFields={{ id, status: reviewed ? "NEW" : "REVIEWED" }}
        confirmLabel={t("Yes, change it")}
        successMessage={t("Updated")}
      />
      <ConfirmationDialog
        trigger={
          <Button variant="outline" size="sm" type="button" aria-label={t("Delete")}>
            <Trash2 />
            {t("Delete")}
          </Button>
        }
        title={t("Delete this résumé?")}
        description={t(
          "The file and the details are removed for good. Do this once you no longer need them.",
        )}
        action={async (prev, formData) => {
          const result = await deleteResumeAction(prev, formData);
          if (result.success) router.refresh();
          return result;
        }}
        hiddenFields={{ id }}
        confirmLabel={t("Delete for good")}
        variant="destructive"
        successMessage={t("Résumé deleted")}
      />
    </div>
  );
}
