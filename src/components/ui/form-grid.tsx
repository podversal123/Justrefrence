import { cn } from "@/lib/utils";

/**
 * The one layout every form uses: two columns from tablet width up, one column on a phone, so a
 * form takes a screen instead of a long scroll. A field that needs the whole row (a long address
 * line, a notes box) adds `FULL_ROW`.
 */
export const FULL_ROW = "sm:col-span-2";

export function FormGrid({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("grid gap-4 sm:grid-cols-2", className)} {...props} />;
}
