"use client";

import { msg } from "@/i18n/locales";
import { useT } from "@/i18n/provider";
import { FilterBar, SelectFilter } from "@/components/ui/filter-bar";

const STATUS_OPTIONS = [
  { value: "FRESH", label: "Fresh" },
  { value: "USED", label: "Used" },
  { value: "EXPIRED", label: "Expired" },
  { value: "REVOKED", label: "Revoked" },
];

export function EpinFilters() {
  const t = useT();
  return (
    <FilterBar>
      <SelectFilter
        paramName="status"
        ariaLabel={msg("Filter by status")}
        placeholder={t("All statuses")}
        options={STATUS_OPTIONS}
      />
    </FilterBar>
  );
}
