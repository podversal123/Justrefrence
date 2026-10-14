"use client";

import { useT } from "@/i18n/provider";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import Link from "next/link";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { ActionForm } from "@/components/ui/action-form";
import { NativeSelect } from "@/components/ui/native-select";
import { buttonVariants } from "@/components/ui/button";
import { createAuctionAction } from "@/server/services/auction-actions";

/** `datetime-local` value for IST "now + minutes" — the platform shows and reads every time as IST. */
function istLocal(minutesFromNow: number): string {
  const ist = new Date(Date.now() + minutesFromNow * 60_000 + 5.5 * 3_600_000);
  return ist.toISOString().slice(0, 16);
}

export interface AuctionListingOption {
  value: string;
  label: string;
  stock: number | null;
}

export function AuctionForm({ listings }: { listings: AuctionListingOption[] }) {
  const t = useT();
  const router = useRouter();
  const [selected, setSelected] = useState(listings[0]?.value ?? "");
  const stock = listings.find((l) => l.value === selected)?.stock ?? null;

  if (listings.length === 0) {
    return (
      <div className="space-y-3 rounded-lg border p-5 text-sm">
        <p className="font-medium">{t("You have no approved listings yet")}</p>
        <p className="text-muted-foreground">
          {t(
            "Add a product, service or project and wait for it to be approved. Then you can put it up for auction.",
          )}
        </p>
        <Link
          href={"/vendor/catalog/products" as Route}
          className={buttonVariants({ variant: "outline" })}
        >
          {t("Go to my products")}
        </Link>
      </div>
    );
  }

  return (
    <ActionForm
      action={createAuctionAction}
      submitLabel={t("Start auction")}
      pendingLabel={t("Starting…")}
      successMessage={t("Auction started")}
      onSuccess={(data) => router.push(`/auctions/${data.auctionId}` as Route)}
    >
      {(errors) => (
        <div className="space-y-5">
          <FormField
            htmlFor="au-listing"
            label={t("What are you selling?")}
            hint={t("Only your approved, active listings are shown.")}
            error={errors["itemId"] ?? errors["itemType"]}
          >
            <NativeSelect
              id="au-listing"
              name="listing"
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
            >
              {listings.map((listing) => (
                <option key={listing.value} value={listing.value}>
                  {listing.label}
                </option>
              ))}
            </NativeSelect>
          </FormField>

          <FormField
            htmlFor="au-qty"
            label={t("Quantity for sale")}
            hint={stock !== null ? t("You have {count} in stock.", { count: stock }) : undefined}
            error={errors["quantity"]}
          >
            <Input
              id="au-qty"
              name="quantity"
              type="number"
              min={1}
              max={stock ?? undefined}
              defaultValue={1}
              required
            />
          </FormField>

          <FormField
            htmlFor="au-desc"
            label={t("Details (optional)")}
            hint={t("Condition, delivery, anything a bidder should know.")}
            error={errors["description"]}
          >
            <Textarea id="au-desc" name="description" rows={4} maxLength={2000} />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-3">
            <FormField
              htmlFor="au-start"
              label={t("Starting price per unit (₹)")}
              hint={t("The first bid must be at least this.")}
              error={errors["startPriceRupees"]}
            >
              <Input id="au-start" name="startPriceRupees" inputMode="decimal" required />
            </FormField>
            <FormField
              htmlFor="au-inc"
              label={t("Minimum raise per bid (₹)")}
              hint={t("Leave empty to allow any higher bid.")}
              error={errors["minIncrementRupees"]}
            >
              <Input id="au-inc" name="minIncrementRupees" inputMode="decimal" placeholder="50" />
            </FormField>
            <FormField
              htmlFor="au-reserve"
              label={t("Lowest price you accept (₹), optional")}
              hint={t("If bidding ends below this, nothing is sold. Bidders never see it.")}
              error={errors["reservePriceRupees"]}
            >
              <Input id="au-reserve" name="reservePriceRupees" inputMode="decimal" />
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              htmlFor="au-closes"
              label={t("Bidding closes (IST)")}
              hint={t("At least 5 minutes from now.")}
              error={errors["closesAtLocal"]}
            >
              <Input
                id="au-closes"
                name="closesAtLocal"
                type="datetime-local"
                defaultValue={istLocal(60 * 24)}
                required
              />
            </FormField>
            <FormField
              htmlFor="au-ext"
              label={t("Extend if a bid arrives in the last (minutes)")}
              hint={t("0 turns this off. Stops last-second bids from ending an auction early.")}
              error={errors["autoExtendMinutes"]}
            >
              <Input
                id="au-ext"
                name="autoExtendMinutes"
                type="number"
                min={0}
                max={30}
                defaultValue={5}
              />
            </FormField>
          </div>
        </div>
      )}
    </ActionForm>
  );
}
