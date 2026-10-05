"use client";

import type { ReactNode } from "react";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * The app's one reusable "detail drawer" pattern (Phase 10 brief) — a
 * consistent header/scrollable-body/sticky-footer shell over the existing
 * Sheet primitive, sized for record details rather than Sheet's default
 * narrow (24rem) width.
 */
export function DetailDrawer({
  open,
  onOpenChange,
  title,
  description,
  footer,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className={cn("w-full gap-0 sm:max-w-md", className)}>
        <SheetHeader className="border-border border-b">
          <SheetTitle>{title}</SheetTitle>
          {description ? <SheetDescription>{description}</SheetDescription> : null}
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
        {footer ? <SheetFooter className="border-border border-t">{footer}</SheetFooter> : null}
      </SheetContent>
    </Sheet>
  );
}
