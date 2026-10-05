"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The app's one reusable "bulk actions" pattern (Phase 10 brief) — appears
 * above a table once rows are selected. Consumers own selection state
 * (row checkboxes) and pass the resulting count + action buttons; this
 * component only renders the bar and the clear-selection control.
 */
export function BulkActionToolbar({
  count,
  onClear,
  actions,
  className,
}: {
  count: number;
  onClear: () => void;
  actions: ReactNode;
  className?: string;
}) {
  if (count === 0) return null;

  return (
    <div
      role="toolbar"
      aria-label={`${count} row${count === 1 ? "" : "s"} selected`}
      className={cn(
        "shadow-overlay-sm bg-card sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon-sm" onClick={onClear} aria-label="Clear selection">
          <X />
        </Button>
        <span className="text-sm font-medium">
          {count} selected
        </span>
      </div>
      <div className="flex items-center gap-2">{actions}</div>
    </div>
  );
}
