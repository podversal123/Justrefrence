"use client";

import { useEffect, useSyncExternalStore } from "react";
import { msg } from "@/i18n/locales";
import { useT } from "@/i18n/provider";
import { cn } from "@/lib/utils";

/** Root font sizes for the "A-  A  A+" control. Everything is sized in rem, so the whole page scales. */
const SIZES = [
  { key: "small", px: 14, label: "A-", sample: "text-[11px]", name: msg("Smaller text") },
  { key: "normal", px: 16, label: "A", sample: "text-xs", name: msg("Normal text") },
  { key: "large", px: 18, label: "A+", sample: "text-sm", name: msg("Larger text") },
] as const;
const STORAGE_KEY = "jr:font-size";
const DEFAULT_PX = 16;

const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

function readStored(): number {
  try {
    const saved = Number(window.localStorage.getItem(STORAGE_KEY));
    return SIZES.some((s) => s.px === saved) ? saved : DEFAULT_PX;
  } catch {
    return DEFAULT_PX;
  }
}

function store(px: number): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(px));
  } catch {
    // Private mode: the size still applies for this visit.
  }
  listeners.forEach((notify) => notify());
}

/** Text-size buttons for the utility bar, remembered per browser. */
export function FontSizeControl({ className }: { className?: string }) {
  const t = useT();
  const px = useSyncExternalStore(subscribe, readStored, () => DEFAULT_PX);

  useEffect(() => {
    document.documentElement.style.fontSize = `${px}px`;
  }, [px]);

  return (
    <div role="group" aria-label={t("Text size")} className={cn("flex items-center", className)}>
      <span className="mr-2 opacity-80">{t("Text size")}</span>
      {SIZES.map((size) => (
        <button
          key={size.key}
          type="button"
          aria-pressed={px === size.px}
          onClick={() => store(size.px)}
          className={cn(
            "h-6 min-w-6 px-1.5 font-medium outline-none focus-visible:ring-2 focus-visible:ring-white/70",
            size.sample,
            px === size.px ? "bg-white/20" : "hover:bg-white/10",
          )}
        >
          <span className="sr-only">{t(size.name)}</span>
          <span aria-hidden="true">{size.label}</span>
        </button>
      ))}
    </div>
  );
}
