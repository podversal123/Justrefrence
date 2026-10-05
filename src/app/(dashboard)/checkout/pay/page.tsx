import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/server/auth/session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PayNowClient } from "./pay-now-client";

export const metadata: Metadata = { title: "Pay for your order" };

interface PageProps {
  searchParams: Promise<{ checkoutId?: string }>;
}

export default async function CheckoutPayPage({ searchParams }: PageProps) {
  const session = await getAuthSession();
  if (!session) redirect("/login");

  const { checkoutId } = await searchParams;
  if (!checkoutId) redirect("/orders");

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle>Complete your payment</CardTitle>
          <CardDescription>
            Your order has been placed — complete payment to confirm it. See
            docs/adr/0016-razorpay-payment-integration.md.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PayNowClient checkoutId={checkoutId} />
        </CardContent>
      </Card>
    </div>
  );
}
