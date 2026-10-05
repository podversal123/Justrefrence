import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/server/auth/session";
import { getMemberProfileByUserId } from "@/server/repositories/identity/member-repository";
import { getCheckoutPreview } from "@/server/domain/commerce/checkout-service";
import { formatPaise } from "@/lib/money";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { PlaceOrderForm } from "./place-order-form";

export const metadata: Metadata = { title: "Checkout" };

interface PageProps {
  searchParams: Promise<{ coupon?: string }>;
}

export default async function CheckoutPage({ searchParams }: PageProps) {
  const session = await getAuthSession();
  if (!session) redirect("/login");

  const memberProfile = await getMemberProfileByUserId(session.userId);
  if (!memberProfile) redirect("/cart");

  const { coupon } = await searchParams;

  let preview;
  try {
    preview = await getCheckoutPreview(session.userId, memberProfile.id, coupon);
  } catch {
    redirect("/cart");
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <div>
        <h1>Checkout</h1>
        <p className="text-muted-foreground">
          {preview.groups.length > 1
            ? `This will create ${preview.groups.length} separate orders, one per vendor.`
            : "Review your order before placing it."}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Coupon</CardTitle>
        </CardHeader>
        <CardContent>
          <form method="get" className="flex items-end gap-2">
            <div className="flex-1 space-y-2">
              <Label htmlFor="coupon">Coupon code</Label>
              <Input id="coupon" name="coupon" defaultValue={coupon} placeholder="SAVE10" />
            </div>
            <Button type="submit" variant="outline">
              Apply
            </Button>
          </form>
          {preview.couponError ? (
            <Alert variant="destructive" className="mt-3">
              <AlertCircle className="size-4" />
              <AlertDescription>{preview.couponError}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      {preview.groups.map((group) => (
        <Card key={group.vendorId}>
          <CardHeader>
            <CardTitle className="text-base">{group.vendorBusinessName}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {group.lines.map((line) => (
              <div key={line.itemId} className="flex justify-between text-sm">
                <span>
                  {line.title} × {line.qty}
                </span>
                <span>{formatPaise((line.unitPrice * BigInt(line.qty)).toString())}</span>
              </div>
            ))}
            <Separator />
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatPaise(group.pricing.subtotal.toString())}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Discount</span>
                <span>-{formatPaise(group.pricing.discountTotal.toString())}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax (GST)</span>
                <span>{formatPaise(group.pricing.taxTotal.toString())}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Platform fee</span>
                <span>{formatPaise(group.pricing.platformFeeTotal.toString())}</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>Order total</span>
                <span>{formatPaise(group.pricing.grandTotal.toString())}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardContent className="flex items-center justify-between py-4">
          <div>
            <p className="text-muted-foreground text-sm">Total payable</p>
            <p className="text-xl font-semibold">{formatPaise(preview.grandTotal.toString())}</p>
          </div>
          <PlaceOrderForm couponCode={coupon} />
        </CardContent>
      </Card>
    </div>
  );
}
