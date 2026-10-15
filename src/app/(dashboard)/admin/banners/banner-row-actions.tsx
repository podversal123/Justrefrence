"use client";

import { useT } from "@/i18n/provider";
import { useTransition } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, Trash2 } from "lucide-react";
import {
  deleteBannerAction,
  moveBannerAction,
  toggleBannerAction,
} from "@/server/services/banner-actions";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import type { ApiResult } from "@/lib/api-response";

type Action = (prev: unknown, formData: FormData) => Promise<ApiResult<null>>;

/** Runs a banner action and reports the outcome the moment the server answers. */
function useRun(action: Action, id: string, extra: Record<string, string> = {}) {
  const t = useT();
  const [pending, start] = useTransition();
  const run = (message?: string) =>
    start(async () => {
      const formData = new FormData();
      formData.set("id", id);
      for (const [k, v] of Object.entries(extra)) formData.set(k, v);
      const result = await action(undefined, formData);
      if (!result.success) toast.error(t("Could not do that"), result.error.message);
      else if (message) toast.success(message);
    });
  return { pending, run };
}

export function BannerRowActions({
  id,
  headline,
  isActive,
  isFirst,
  isLast,
}: {
  id: string;
  headline: string;
  isActive: boolean;
  isFirst: boolean;
  isLast: boolean;
}) {
  const t = useT();
  const up = useRun(moveBannerAction, id, { direction: "UP" });
  const down = useRun(moveBannerAction, id, { direction: "DOWN" });
  const toggle = useRun(toggleBannerAction, id);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button
        variant="outline"
        size="icon-sm"
        disabled={isFirst || up.pending}
        onClick={() => up.run()}
      >
        <ArrowUp />
        <span className="sr-only">{t("Move up")}</span>
      </Button>
      <Button
        variant="outline"
        size="icon-sm"
        disabled={isLast || down.pending}
        onClick={() => down.run()}
      >
        <ArrowDown />
        <span className="sr-only">{t("Move down")}</span>
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={toggle.pending}
        onClick={() => toggle.run(isActive ? "Banner hidden" : "Banner is showing")}
      >
        {isActive ? <EyeOff /> : <Eye />}
        {isActive ? t("Hide") : t("Show")}
      </Button>
      <ConfirmationDialog
        trigger={
          <Button variant="outline" size="icon-sm">
            <Trash2 />
            <span className="sr-only">{t("Delete")}</span>
          </Button>
        }
        title={t("Delete this banner?")}
        description={`"${headline}" and its photo will be removed from the home page. This cannot be undone.`}
        action={async (prev, formData) => {
          const result = await deleteBannerAction(prev, formData);
          if (result.success) toast.success(t("Banner deleted"));
          return result;
        }}
        hiddenFields={{ id }}
        confirmLabel={t("Delete")}
        variant="destructive"
      />
    </div>
  );
}
