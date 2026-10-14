"use client";

import { useT } from "@/i18n/provider";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Gavel, Radio, Trophy } from "lucide-react";
import { Countdown } from "@/components/bidding/countdown";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { ActionForm } from "@/components/ui/action-form";
import { toast } from "@/components/ui/toast";
import { formatPaise, paiseToRupeesInput } from "@/lib/money";
import { rupeesToPaise } from "@/lib/money-input";
import { cn } from "@/lib/utils";
import { placeAuctionBidAction } from "@/server/services/auction-actions";
import type { AuctionSnapshot } from "@/server/domain/auction/view";

const POLL_MS = 4000;

/**
 * Live status of one auction plus the bid box. Polls the live API while bidding is open and the
 * tab is visible; the server answers with exactly what this viewer may see. When the status,
 * closing time or number of bids changes, the server-rendered parts of the page (the bid history)
 * are refreshed too.
 */
export function AuctionLive({
  auctionId,
  quantity,
  initial,
  canBid,
}: {
  auctionId: string;
  quantity: number;
  initial: AuctionSnapshot;
  /** True only for a signed-in member who is not the seller. */
  canBid: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [snapshot, setSnapshot] = useState(initial);
  const [stale, setStale] = useState(false);
  const last = useRef(initial);

  // A page refresh (after this viewer's own bid, or when the poll sees a change) brings a newer
  // server snapshot; adopt it without remounting, so a half-typed bid is never lost.
  const signature = `${initial.status}|${initial.closesAt}|${initial.bidCount}|${initial.topUnitPrice}|${initial.isLeading}`;
  const [seenSignature, setSeenSignature] = useState(signature);
  if (seenSignature !== signature) {
    setSeenSignature(signature);
    setSnapshot(initial);
  }

  useEffect(() => {
    if (snapshot.status !== "OPEN") return;
    let cancelled = false;

    async function poll() {
      if (document.visibilityState === "hidden") return;
      try {
        const response = await fetch(`/api/auctions/${auctionId}/live`, { cache: "no-store" });
        const body = (await response.json()) as { success: boolean; data?: AuctionSnapshot };
        if (cancelled || !response.ok || !body.success || !body.data) {
          if (!cancelled) setStale(true);
          return;
        }
        setStale(false);
        const next = body.data;
        const previous = last.current;
        last.current = next;
        setSnapshot(next);
        if (
          next.status !== previous.status ||
          next.closesAt !== previous.closesAt ||
          next.bidCount !== previous.bidCount
        ) {
          router.refresh();
        }
      } catch {
        if (!cancelled) setStale(true);
      }
    }

    const timer = window.setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [auctionId, snapshot.status, router]);

  const open = snapshot.status === "OPEN";
  const minimum = snapshot.minimumBid;

  return (
    <div className="space-y-4">
      <section
        aria-label={t("Live bidding status")}
        className={cn("space-y-4 rounded-lg border p-5", open && "border-info/40 bg-info/5")}
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
                  {stale ? t("Reconnecting…") : t("Live auction")}
                </>
              ) : (
                <>
                  <Gavel className="size-3.5" aria-hidden="true" />
                  {t("Bidding ended")}
                </>
              )}
            </p>
            <p className="mt-1 text-3xl font-semibold">
              {open ? (
                <Countdown closesAt={snapshot.closesAt} serverNow={snapshot.serverNow} />
              ) : (
                <span className="text-muted-foreground">{t("Ended")}</span>
              )}
            </p>
          </div>
          <div className="text-right">
            <p className="text-muted-foreground text-xs">{t("Bids")}</p>
            <p className="text-3xl font-semibold tabular-nums">{snapshot.bidCount}</p>
          </div>
        </div>

        <div className="bg-background flex items-center justify-between rounded-md border px-3 py-2 text-sm">
          <span className="text-muted-foreground">
            {snapshot.status === "SOLD" ? t("Winning total") : t("Highest total")}
          </span>
          <span className="font-semibold tabular-nums">
            {snapshot.topTotal !== null ? formatPaise(snapshot.topTotal, "INR") : t("No bids yet")}
          </span>
        </div>

        {snapshot.reserve !== "NONE" ? (
          <p className="text-muted-foreground text-xs">
            {snapshot.reserve === "MET"
              ? t("The seller's lowest price has been reached.")
              : t("The seller's lowest price has not been reached yet.")}
          </p>
        ) : null}

        {snapshot.isLeading ? (
          <p className="border-success/50 bg-success/10 flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium">
            <Trophy className="text-success size-4" aria-hidden="true" />
            {t("You have the highest bid")}
          </p>
        ) : null}

        <p role="status" aria-live="polite" className="sr-only">
          {snapshot.isLeading ? t("You have the highest bid.") : ""}
        </p>
      </section>

      {open && canBid && minimum !== null ? (
        <BidBox
          auctionId={auctionId}
          quantity={quantity}
          minimum={minimum}
          isLeading={snapshot.isLeading}
        />
      ) : null}
    </div>
  );
}

function BidBox({
  auctionId,
  quantity,
  minimum,
  isLeading,
}: {
  auctionId: string;
  quantity: number;
  minimum: string;
  isLeading: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [price, setPrice] = useState("");
  const paise = rupeesToPaise(price);
  const total = paise !== null ? paise * BigInt(quantity) : null;

  return (
    <div className="space-y-4 rounded-lg border p-5">
      <div>
        <h2 className="text-base font-semibold">{t("Place your bid")}</h2>
        <p className="text-muted-foreground text-sm">
          {t(
            "The highest bid when the timer ends wins. You can bid again any time you are outbid.",
          )}
        </p>
      </div>
      <ActionForm
        action={placeAuctionBidAction}
        submitLabel={t("Place bid")}
        pendingLabel={t("Submitting…")}
        successMessage={t("Bid placed")}
        resetOnSuccess
        onSuccess={(data) => {
          setPrice("");
          if (data.extended)
            toast.info(t("Bidding was extended"), t("Your bid came in at the last minute."));
          router.refresh();
        }}
      >
        {(errors) => (
          <>
            <input type="hidden" name="auctionId" value={auctionId} />
            <FormField
              htmlFor="auction-bid-price"
              label={t("Your bid per unit (₹)")}
              hint={
                isLeading
                  ? t("You already have the highest bid.")
                  : t("Must be at least ₹{amount}.", { amount: paiseToRupeesInput(minimum) })
              }
              error={errors["unitPriceRupees"]}
            >
              <Input
                id="auction-bid-price"
                name="unitPriceRupees"
                inputMode="decimal"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                placeholder={paiseToRupeesInput(minimum)}
                required
              />
            </FormField>
            <div className="bg-muted/50 flex items-baseline justify-between rounded-md px-3 py-2 text-sm">
              <span className="text-muted-foreground">
                {t("Total for {quantity}", { quantity: quantity.toLocaleString("en-IN") })}
              </span>
              <span className="text-base font-semibold tabular-nums">
                {total !== null ? formatPaise(total.toString(), "INR") : "—"}
              </span>
            </div>
          </>
        )}
      </ActionForm>
    </div>
  );
}
