import { getT } from "@/i18n/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/server/auth/session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PayNowClient } from "./pay-now-client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Pay for your order") };
}

interface PageProps {
  searchParams: Promise<{ checkoutId?: string }>;
}

export default async function CheckoutPayPage({ searchParams }: PageProps) {
  const t = await getT();
  const session = await getAuthSession();
  if (!session) redirect("/login");

  const { checkoutId } = await searchParams;
  if (!checkoutId) redirect("/orders");

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle>{t("Complete your payment")}</CardTitle>
          <CardDescription>
            {t("Your order is placed. Complete the payment to confirm it.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PayNowClient checkoutId={checkoutId} />
        </CardContent>
      </Card>
    </div>
  );
}
