import { getT } from "@/i18n/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ShoppingCart } from "lucide-react";
import { getAuthSession } from "@/server/auth/session";
import { buildCartView } from "@/server/domain/commerce/cart-view";
import { catalogImagePublicUrlClient } from "@/lib/catalog-image-url";
import { formatPaise } from "@/lib/money";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/ui/empty-state";
import { CartLineControls } from "./cart-line-controls";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Cart") };
}

export default async function CartPage() {
  const t = await getT();
  const session = await getAuthSession();
  if (!session) redirect("/login");

  const view = await buildCartView(session.userId);

  if (view.isEmpty) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
        <h1>{t("Cart")}</h1>
        <EmptyState
          icon={ShoppingCart}
          title={t("Your cart is empty")}
          description={t("Browse products, services, or projects to add something.")}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <div>
        <h1>{t("Cart")}</h1>
        <p className="text-muted-foreground">
          {view.groups.length > 1
            ? `Items from ${view.groups.length} vendors will be split into separate orders at checkout.`
            : t("Review your items before checkout.")}
        </p>
      </div>

      {view.groups.map((group) => (
        <Card key={group.vendorId}>
          <CardHeader>
            <CardTitle className="text-base">{group.vendorBusinessName}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {group.lines.map((line) => (
              <div key={line.cartItemId} className="flex gap-3">
                <div className="bg-muted relative size-16 shrink-0 overflow-hidden rounded-md border">
                  {line.primaryImagePath ? (
                    <Image
                      src={catalogImagePublicUrlClient(line.primaryImagePath)}
                      alt={line.title}
                      fill
                      className="object-cover"
                      sizes="64px"
                    />
                  ) : null}
                </div>
                <div className="flex flex-1 flex-col gap-1">
                  <p className="text-sm font-medium">{line.title}</p>
                  {line.available ? (
                    <p className="text-muted-foreground text-sm">
                      {formatPaise(line.unitPrice!.toString())} × {line.qty} ={" "}
                      {formatPaise((line.unitPrice! * BigInt(line.qty)).toString())}
                    </p>
                  ) : (
                    <p className="text-destructive text-sm">{line.unavailableReason}</p>
                  )}
                  <CartLineControls
                    cartItemId={line.cartItemId}
                    qty={line.qty}
                    maxQty={line.maxQty}
                    editable={line.itemType === "PRODUCT" && line.available}
                  />
                </div>
              </div>
            ))}
            <Separator />
            <div className="flex justify-between text-sm font-medium">
              <span>{t("Vendor subtotal")}</span>
              <span>{formatPaise(group.subtotal.toString())}</span>
            </div>
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardContent className="flex items-center justify-between py-4">
          <div>
            <p className="text-muted-foreground text-sm">{t("Cart subtotal")}</p>
            <p className="text-xl font-semibold">{formatPaise(view.subtotal.toString())}</p>
          </div>
          <Button
            size="lg"
            disabled={view.hasUnavailableItems}
            nativeButton={false}
            render={<Link href="/checkout">{t("Proceed to checkout")}</Link>}
          />
        </CardContent>
        {view.hasUnavailableItems ? (
          <CardContent className="text-destructive pt-0 text-sm">
            {t("Remove unavailable items before checking out.")}
          </CardContent>
        ) : null}
      </Card>
    </div>
  );
}
