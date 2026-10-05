import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shared empty state — see docs/performance.md §5 ("a specific message with
 * a relevant call-to-action, not a blank table"). Used by every list view.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-12 text-center",
        className,
      )}
    >
      <div className="bg-muted text-muted-foreground rounded-full p-3">
        <Icon className="size-5" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        {description ? (
          <p className="text-muted-foreground max-w-sm text-sm">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
