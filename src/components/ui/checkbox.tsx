"use client";

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { CheckIcon, MinusIcon } from "lucide-react";
import { cn } from "cn";

/**
 * House checkbox primitive (Base UI, not Radix) — needed for admin table
 * row selection (Phase 10 brief's bulk actions). Didn't exist before this
 * session; built to match the sizing/focus/disabled conventions already
 * used by select.tsx and button.tsx.
 */
function Checkbox({
  className,
  ...props
}: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "border-input focus-visible:ring-ring/50 data-[checked]:bg-primary data-[checked]:border-primary data-[checked]:text-primary-foreground data-[indeterminate]:bg-primary data-[indeterminate]:border-primary data-[indeterminate]:text-primary-foreground dark:bg-input/30 peer size-4 shrink-0 rounded-[4px] border outline-none transition-colors focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center text-current"
      >
        {props.indeterminate ? <MinusIcon className="size-3.5" /> : <CheckIcon className="size-3.5" />}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
