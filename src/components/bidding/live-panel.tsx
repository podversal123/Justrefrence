"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Gavel, Radio, Trophy } from "lucide-react";
import { Countdown } from "@/components/bidding/countdown";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";

export interface LiveSnapshot {
  status: "OPEN" | "CLOSED" | "AWARDED" | "CANCELLED";
  closesAt: string;
  serverNow: string;
  bidCount: number;
  l1Total: string | null;
  myBid: { totalPrice: string; unitPrice: string; rank: number | null; status: string } | null;
}

const POLL_MS = 4000;

/**
 * Live status of one requirement. Polls the live API while bidding is open
 * and the tab is visible; the server answers with exactly what this viewer is
 * allowed to see. When the status or closing time changes (an auction was
 * extended, bidding ended) the server-rendered parts of the page are
 * refreshed too. Announces rank changes to screen readers.
 */
export function LivePanel({
  requirementId,
  type,
  initial,
  audience,
}: {
  requirementId: string;
  type: "TENDER" | "REVERSE_AUCTION";
  initial: LiveSnapshot;
  audience: "vendor" | "owner" | "staff" | "public";
}) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState(initial);
  const [stale, setStale] = useState(false);
  const last = useRef(initial);

  useEffect(() => {
    if (snapshot.status !== "OPEN") return;
    let cancelled = false;

    async function poll() {
      if (document.visibilityState === "hidden") return;
      try {
        const response = await fetch(`/api/bids/${requirementId}/live`, { cache: "no-store" });
        const body = (await response.json()) as { success: boolean; data?: LiveSnapshot };
        if (cancelled || !response.ok || !body.success || !body.data) {
          if (!cancelled) setStale(true);
          return;
        }
        setStale(false);
        const next = body.data;
        const previous = last.current;
        last.current = next;
        setSnapshot(next);
        if (next.status !== previous.status || next.closesAt !== previous.closesAt)
          router.refresh();
      } catch {
        if (!cancelled) setStale(true);
      }
    }

    const timer = window.setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [requirementId, snapshot.status, router]);

  const open = snapshot.status === "OPEN";
  const rank = snapshot.myBid?.rank ?? null;
  const showRank = type === "REVERSE_AUCTION" && rank !== null;
  const isLeader = rank === 1;

  const announcement = showRank
    ? isLeader
      ? "You are currently the lowest bidder (L1)."
      : `You are currently ranked L${rank}.`
    : "";

  return (
    <section
      aria-label="Live bidding status"
      className={cn(
        "space-y-4 rounded-lg border p-5",
        open && type === "REVERSE_AUCTION" && "border-info/40 bg-info/5",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
            {open ? (
              <>
                <Radio
                  className={cn(
                    "size-3.5",
                    !stale && "text-success animate-pulse motion-reduce:animate-none",
                  )}
                  aria-hidden="true"
                />
                {stale
                  ? "Reconnecting…"
                  : type === "REVERSE_AUCTION"
                    ? "Live auction"
                    : "Bidding open"}
              </>
            ) : (
              <>
                <Gavel className="size-3.5" aria-hidden="true" />
                Bidding ended
              </>
            )}
          </p>
          <p className="mt-1 text-3xl font-semibold">
            {open ? (
              <Countdown closesAt={snapshot.closesAt} serverNow={snapshot.serverNow} />
            ) : (
              <span className="text-muted-foreground">Closed</span>
            )}
          </p>
        </div>
        <div className="text-right">
          <p className="text-muted-foreground text-xs">Bids</p>
          <p className="text-3xl font-semibold tabular-nums">{snapshot.bidCount}</p>
        </div>
      </div>

      {snapshot.l1Total !== null ? (
        <div className="bg-background flex items-center justify-between rounded-md border px-3 py-2 text-sm">
          <span className="text-muted-foreground">
            {snapshot.status === "AWARDED" ? "Winning total" : "Lowest total (L1)"}
          </span>
          <span className="font-semibold tabular-nums">{formatPaise(snapshot.l1Total, "INR")}</span>
        </div>
      ) : null}

      {snapshot.myBid && snapshot.myBid.status !== "WITHDRAWN" ? (
        <div
          className={cn(
            "flex items-center justify-between rounded-md border px-3 py-2 text-sm",
            isLeader && open ? "border-success/50 bg-success/10" : "bg-background",
          )}
        >
          <span className="flex items-center gap-1.5">
            {isLeader && open ? (
              <Trophy className="text-success size-4" aria-hidden="true" />
            ) : null}
            {showRank ? (isLeader ? "You are L1" : `You are L${rank}`) : "Your bid"}
          </span>
          <span className="font-semibold tabular-nums">
            {formatPaise(snapshot.myBid.totalPrice, "INR")}
          </span>
        </div>
      ) : null}

      {audience === "owner" && open && type === "TENDER" ? (
        <p className="text-muted-foreground text-xs">
          Bids are sealed. You will see every offer, with prices and vendor names, once bidding
          closes.
        </p>
      ) : null}

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
