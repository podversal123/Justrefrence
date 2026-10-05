"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** Layout wrapper for a row of filter controls — pairs with SearchInput and SelectFilter. */
export function FilterBar({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-center", className)}>
      {children}
    </div>
  );
}

export interface SelectFilterOption {
  value: string;
  label: string;
}

/**
 * A single URL-param-bound filter select — the `ALL`/empty option clears
 * the param entirely rather than submitting an empty-string filter.
 */
export function SelectFilter({
  paramName,
  options,
  placeholder,
  ariaLabel,
  clearValue = "ALL",
  className,
}: {
  paramName: string;
  options: SelectFilterOption[];
  placeholder: string;
  ariaLabel: string;
  clearValue?: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get(paramName) ?? clearValue;

  function update(value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== clearValue) params.set(paramName, value);
    else params.delete(paramName);
    params.delete("cursor");
    router.push(`${pathname}?${params.toString()}` as never);
  }

  return (
    <Select value={current} onValueChange={update}>
      <SelectTrigger className={className ?? "w-full sm:w-44"} aria-label={ariaLabel}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
