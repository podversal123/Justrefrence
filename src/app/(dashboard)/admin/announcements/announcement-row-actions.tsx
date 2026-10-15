"use client";

import { useT } from "@/i18n/provider";
import { useTransition } from "react";
import { Archive, Check } from "lucide-react";
import {
  archiveAnnouncementAction,
  publishAnnouncementAction,
} from "@/server/services/announcement-actions";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";

export function AnnouncementRowActions({
  id,
  title,
  status,
  canPublish,
  canTakeDown,
}: {
  id: string;
  title: string;
  status: "PENDING" | "PUBLISHED" | "ARCHIVED";
  canPublish: boolean;
  canTakeDown: boolean;
}) {
  const t = useT();
  const [pending, start] = useTransition();

  function publish() {
    start(async () => {
      const formData = new FormData();
      formData.set("id", id);
      const result = await publishAnnouncementAction(undefined, formData);
      if (result.success) toast.success(t("Announcement published"));
      else toast.error(t("Could not publish"), result.error.message);
    });
  }

  if (status === "ARCHIVED") return null;
  const mayRemove = status === "PENDING" || canTakeDown;
  const label = status === "PENDING" ? "Reject" : "Take down";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {status === "PENDING" && canPublish ? (
        <Button size="sm" disabled={pending} onClick={publish}>
          <Check />
          {t("Publish")}
        </Button>
      ) : null}
      {mayRemove ? (
        <ConfirmationDialog
          trigger={
            <Button variant="outline" size="sm">
              <Archive />
              {label}
            </Button>
          }
          title={
            status === "PENDING"
              ? t("Reject this announcement?")
              : t("Take this announcement down?")
          }
          description={`"${title}" will not show on any dashboard.`}
          action={async (prev, formData) => {
            const result = await archiveAnnouncementAction(prev, formData);
            if (result.success) toast.success(t("Announcement removed"));
            return result;
          }}
          hiddenFields={{ id }}
          confirmLabel={label}
          variant="destructive"
        />
      ) : null}
    </div>
  );
}
