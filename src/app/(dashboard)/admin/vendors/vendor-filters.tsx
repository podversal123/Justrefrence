"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STATUS_OPTIONS = [
  { value: "ALL", label: "All statuses" },
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "SUSPENDED", label: "Suspended" },
];

const SORT_OPTIONS = [
  { value: "createdAt:desc", label: "Newest first" },
  { value: "createdAt:asc", label: "Oldest first" },
  { value: "businessName:asc", label: "Business name (A–Z)" },
  { value: "businessName:desc", label: "Business name (Z–A)" },
];

/**
 * Search/filter/sort controls for the vendor list — pushes to URL search
 * params so the list itself stays a Server Component (data fetched
 * server-side, filters are shareable/bookmarkable links). Search is
 * debounced client-side to avoid a navigation per keystroke.
 */
export function VendorFilters({
  initialSearch,
  initialStatus,
  initialSort,
}: {
  initialSearch: string;
  initialStatus: string;
  initialSort: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(initialSearch);

  useEffect(() => {
    const handle = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (search) params.set("search", search);
      else params.delete("search");
      params.delete("cursor");
      router.push(`/admin/vendors?${params.toString()}` as never);
    }, 350);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally only reacts to `search`; re-adding router/searchParams would refire this on every URL change
  }, [search]);

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== "ALL") params.set(key, value);
    else params.delete(key);
    params.delete("cursor");
    router.push(`/admin/vendors?${params.toString()}` as never);
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1 sm:max-w-xs">
        <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search business, name, or email…"
          className="pl-8"
          aria-label="Search vendors"
        />
      </div>

      <Select
        value={initialStatus || "ALL"}
        onValueChange={(value) => updateParam("status", value ?? "ALL")}
      >
        <SelectTrigger className="w-full sm:w-44" aria-label="Filter by status">
          <SelectValue placeholder="All statuses" />
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={initialSort}
        onValueChange={(value) => {
          const [sortBy, sortDir] = (value ?? "createdAt:desc").split(":");
          const params = new URLSearchParams(searchParams.toString());
          params.set("sortBy", sortBy ?? "createdAt");
          params.set("sortDir", sortDir ?? "desc");
          params.delete("cursor");
          router.push(`/admin/vendors?${params.toString()}` as never);
        }}
      >
        <SelectTrigger className="w-full sm:w-48" aria-label="Sort vendors">
          <SelectValue placeholder="Sort" />
        </SelectTrigger>
        <SelectContent>
          {SORT_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
