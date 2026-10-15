import { Check, X } from "lucide-react";
import { getFormat, getT } from "@/i18n/server";
import { statusLabel } from "@/components/ui/status-badge";
import { buildTracking, type TrackingHistoryEntry } from "@/lib/order-tracking";
import { cn } from "@/lib/utils";

/** The order's progress as a vertical timeline: what is done, where it is now, what comes next. */
export async function OrderTracker({
  status,
  history,
}: {
  status: string;
  history: TrackingHistoryEntry[];
}) {
  const t = await getT();
  const { formatDate } = await getFormat();
  const { steps, ending } = buildTracking(status, history);

  return (
    <ol className="space-y-0">
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1 && !ending;
        return (
          <li key={step.status} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs",
                  step.state === "done" && "bg-success border-success text-white",
                  step.state === "current" && "border-primary bg-primary/10 text-primary",
                  step.state === "upcoming" && "border-border text-muted-foreground",
                )}
                aria-hidden="true"
              >
                {step.state === "done" ? (
                  <Check className="size-3.5" />
                ) : (
                  <span
                    className={cn(
                      "size-2 rounded-full",
                      step.state === "current" ? "bg-primary" : "bg-border",
                    )}
                  />
                )}
              </span>
              {isLast ? null : (
                <span
                  className={cn(
                    "my-1 w-px flex-1",
                    step.state === "done" ? "bg-success" : "bg-border",
                  )}
                />
              )}
            </div>
            <div className="pb-5">
              <p
                className={cn(
                  "text-sm font-medium",
                  step.state === "upcoming" && "text-muted-foreground",
                )}
              >
                {t(statusLabel(step.status))}
                {step.state === "current" ? (
                  <span className="text-primary ml-2 text-xs font-normal">{t("Now")}</span>
                ) : null}
              </p>
              {step.at ? (
                <p className="text-muted-foreground text-xs">{formatDate(step.at)}</p>
              ) : null}
            </div>
          </li>
        );
      })}
      {ending ? (
        <li className="flex gap-3">
          <span className="bg-destructive flex size-6 shrink-0 items-center justify-center rounded-full text-white">
            <X className="size-3.5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-destructive text-sm font-medium">{t(statusLabel(ending.status))}</p>
            <p className="text-muted-foreground text-xs">{formatDate(ending.at)}</p>
            {ending.reason ? <p className="mt-1 text-sm">{ending.reason}</p> : null}
          </div>
        </li>
      ) : null}
    </ol>
  );
}
