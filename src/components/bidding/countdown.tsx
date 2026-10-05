"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** "2d 4h" / "3h 12m" / "07:45" / "00:09" — coarse when far away, precise when close. */
export function formatRemaining(ms: number): string {
  if (ms <= 0) return "Closed";
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${pad(minutes)}m ${pad(seconds)}s`;
  return `${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Time left until `closesAt`, measured against the SERVER's clock: the offset
 * between `serverNow` and the browser's clock is applied, so a wrong device
 * clock can't show an auction as open (or closed) when it isn't. The server
 * still decides — this is display only.
 */
export function Countdown({
  closesAt,
  serverNow,
  className,
  closedLabel = "Closed",
}: {
  closesAt: string;
  serverNow: string;
  className?: string;
  closedLabel?: string;
}) {
  // Offset is captured once, lazily, at first render on the client.
  const [offset] = useState(() => new Date(serverNow).getTime() - Date.now());
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now() + offset);
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [offset]);

  const remaining = new Date(closesAt).getTime() - (now ?? new Date(serverNow).getTime());
  const urgent = remaining > 0 && remaining < 5 * 60_000;
  const text = remaining <= 0 ? closedLabel : formatRemaining(remaining);

  return (
    <span
      role="timer"
      aria-label={remaining <= 0 ? "Bidding is closed" : `Time left: ${text}`}
      className={cn("tabular-nums", urgent && "text-destructive font-semibold", className)}
    >
      {text}
    </span>
  );
}
