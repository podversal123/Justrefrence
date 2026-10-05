"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DATE_RANGE_PRESETS, type DateRangePreset } from "@/server/domain/dashboard/date-range";
import { cn } from "@/lib/utils";

const LABELS: Record<DateRangePreset, string> = {
  "7D": "7 days",
  "30D": "30 days",
  "90D": "90 days",
  ALL: "All time",
};

export function DateRangeSelector({ current }: { current: DateRangePreset }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function select(preset: DateRangePreset) {
    const params = new URLSearchParams(searchParams);
    params.set("range", preset);
    router.push(`${pathname}?${params.toString()}` as never);
  }

  return (
    <div className="bg-muted inline-flex items-center gap-0.5 rounded-lg p-0.5">
      {DATE_RANGE_PRESETS.map((preset) => (
        <button
          key={preset}
          type="button"
          onClick={() => select(preset)}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            preset === current
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {LABELS[preset]}
        </button>
      ))}
    </div>
  );
}
