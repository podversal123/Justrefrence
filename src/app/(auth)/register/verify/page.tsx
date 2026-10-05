import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { VerifyForm } from "./verify-form";

export const metadata: Metadata = { title: "Verify your account" };

interface PageProps {
  searchParams: Promise<{ userId?: string; channel?: string; ref?: string }>;
}

export default async function VerifyRegistrationPage({ searchParams }: PageProps) {
  const { userId, channel, ref } = await searchParams;

  if (!userId || !channel) {
    redirect("/register");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Enter your code</CardTitle>
        <CardDescription>
          We sent a 6-digit verification code to your {channel === "EMAIL" ? "email" : "phone"}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <VerifyForm userId={userId} channel={channel} referralCode={ref} />
      </CardContent>
    </Card>
  );
}
