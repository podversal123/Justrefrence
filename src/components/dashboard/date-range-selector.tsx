"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DATE_RANGE_PRESETS, type DateRangePreset } from "@/server/domain/dashboard/date-range";
import { cn } from "@/lib/utils";
import { msg } from "@/i18n/locales";
import { useT } from "@/i18n/provider";

const LABELS: Record<DateRangePreset, string> = {
  "7D": msg("7 days"),
  "30D": msg("30 days"),
  "90D": msg("90 days"),
  ALL: msg("All time"),
};

export function DateRangeSelector({ current }: { current: DateRangePreset }) {
  const t = useT();
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
          {t(LABELS[preset])}
        </button>
      ))}
    </div>
  );
}
