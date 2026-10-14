import { getT } from "@/i18n/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { VerifyForm } from "./verify-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Verify your account") };
}

interface PageProps {
  searchParams: Promise<{ userId?: string; channel?: string; ref?: string }>;
}

export default async function VerifyRegistrationPage({ searchParams }: PageProps) {
  const { userId, channel, ref } = await searchParams;
  const t = await getT();

  if (!userId || !channel) {
    redirect("/register");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Enter your code")}</CardTitle>
        <CardDescription>
          {channel === "EMAIL"
            ? t("We sent a 6-digit verification code to your email.")
            : t("We sent a 6-digit verification code to your phone.")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <VerifyForm userId={userId} channel={channel} referralCode={ref} />
      </CardContent>
    </Card>
  );
}
