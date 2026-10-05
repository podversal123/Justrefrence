import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Create your account" };

interface PageProps {
  searchParams: Promise<{ ref?: string }>;
}

export default async function RegisterPage({ searchParams }: PageProps) {
  const { ref } = await searchParams;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your account</CardTitle>
        <CardDescription>
          Register with your email and mobile number — we&apos;ll send a verification code to
          confirm it&apos;s you.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RegisterForm initialReferralCode={ref} />
      </CardContent>
    </Card>
  );
}
