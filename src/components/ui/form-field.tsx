import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Label + control + field-level error message, reused by every catalog
 * create/edit form — see the Phase 3 brief's "Form" reusable-component
 * requirement. Not a form-state library wrapper (this app uses native
 * FormData + Server Actions throughout, not react-hook-form) — just the
 * repeated layout/error-display piece.
 */
export function FormField({
  htmlFor,
  label,
  hint,
  error,
  children,
  className,
}: {
  htmlFor: string;
  label: string;
  hint?: string;
  error?: string[];
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && !error?.length ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
      {error?.length ? <p className="text-destructive text-xs">{error[0]}</p> : null}
    </div>
  );
}
