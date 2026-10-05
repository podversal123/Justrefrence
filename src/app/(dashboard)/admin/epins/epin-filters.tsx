"use client";

import { FilterBar, SelectFilter } from "@/components/ui/filter-bar";

const STATUS_OPTIONS = [
  { value: "FRESH", label: "Fresh" },
  { value: "USED", label: "Used" },
  { value: "EXPIRED", label: "Expired" },
  { value: "REVOKED", label: "Revoked" },
];

export function EpinFilters() {
  return (
    <FilterBar>
      <SelectFilter
        paramName="status"
        ariaLabel="Filter by status"
        placeholder="All statuses"
        options={STATUS_OPTIONS}
      />
    </FilterBar>
  );
}
