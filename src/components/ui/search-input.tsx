"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

/**
 * Debounced, URL-param-driven search box — generalized from the pattern
 * first built for the Phase 2 vendor list, now shared by every catalog list
 * too. Pushes to the current pathname with `paramName` set/cleared, so
 * results stay a Server Component fetch (server-side filtering, shareable
 * URLs) rather than client-side state.
 */
export function SearchInput({
  paramName = "search",
  placeholder = "Search…",
  debounceMs = 350,
  className,
}: {
  paramName?: string;
  placeholder?: string;
  debounceMs?: number;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get(paramName) ?? "");

  useEffect(() => {
    const handle = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set(paramName, value);
      else params.delete(paramName);
      params.delete("cursor");
      router.push(`${pathname}?${params.toString()}` as never);
    }, debounceMs);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally only reacts to `value`; re-adding router/searchParams/pathname would refire this on every navigation
  }, [value]);

  return (
    <div className={className ? className : "relative flex-1 sm:max-w-xs"}>
      <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="pl-8"
        aria-label={placeholder}
      />
    </div>
  );
}
