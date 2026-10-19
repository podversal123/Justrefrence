import { getT } from "@/i18n/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/server/auth/session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PayNowClient } from "./pay-now-client";
import { WalletOrCardChoice } from "./wallet-choice";
import { prisma } from "@/server/lib/prisma";
import { getSiteSettings } from "@/server/lib/site-settings";
import { getCheckoutPayableAmount } from "@/server/domain/payment/payment-service";

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

  // Offer the wallet only when it is switched on and the balance covers the whole amount.
  let wallet: { amount: string; balance: string } | null = null;
  if (/^[0-9a-f-]{36}$/i.test(checkoutId) && (await getSiteSettings()).walletPaymentEnabled) {
    const owns = await prisma.checkout.findFirst({
      where: { id: checkoutId, buyerId: session.userId },
      select: { id: true },
    });
    const paid = owns
      ? await prisma.payment.findFirst({ where: { checkoutId, status: "CAPTURED" }, select: { id: true } })
      : null;
    if (owns && !paid) {
      const [{ amount }, w] = await Promise.all([
        getCheckoutPayableAmount(checkoutId).catch(() => ({ amount: 0n })),
        prisma.wallet.findUnique({ where: { ownerUserId: session.userId }, select: { balance: true } }),
      ]);
      if (amount > 0n && w && w.balance >= amount) {
        wallet = { amount: amount.toString(), balance: w.balance.toString() };
      }
    }
  }

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
          {wallet ? (
            <WalletOrCardChoice checkoutId={checkoutId} amount={wallet.amount} balance={wallet.balance} />
          ) : (
            <PayNowClient checkoutId={checkoutId} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
