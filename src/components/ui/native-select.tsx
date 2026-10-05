import { cn } from "@/lib/utils";

/**
 * A styled native <select>. The base-ui `Select` in ./select.tsx is a custom
 * popup that doesn't submit through plain FormData the way a native control
 * does; for simple forms driven by Server Actions this one is lighter, works
 * without JavaScript state, and is fully keyboard/screen-reader accessible.
 */
export function NativeSelect({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      {...props}
      className={cn(
        "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-3 disabled:opacity-50",
        className,
      )}
    >
      {children}
    </select>
  );
}
