"use client";

import { FilterBar, SelectFilter } from "@/components/ui/filter-bar";

const STATUS_OPTIONS = [
  { value: "ALL", label: "All statuses" },
  { value: "REQUESTED", label: "Requested" },
  { value: "APPROVED", label: "Approved" },
  { value: "PROCESSING", label: "Processing" },
  { value: "PAID", label: "Paid" },
  { value: "REJECTED", label: "Rejected" },
  { value: "FAILED", label: "Failed" },
];

/** Status filter for the payout queue — pushes `?status=` the same way VendorFilters does. */
export function PayoutFilters() {
  return (
    <FilterBar>
      <SelectFilter
        paramName="status"
        options={STATUS_OPTIONS}
        placeholder="All statuses"
        ariaLabel="Filter by status"
        className="w-full sm:w-48"
      />
    </FilterBar>
  );
}
