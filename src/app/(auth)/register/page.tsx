import { getT } from "@/i18n/server";
import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RegisterForm } from "./register-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Create your account") };
}

interface PageProps {
  searchParams: Promise<{ ref?: string }>;
}

export default async function RegisterPage({ searchParams }: PageProps) {
  const { ref } = await searchParams;
  const t = await getT();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Create your account")}</CardTitle>
        <CardDescription>
          {t(
            "Register with your email and mobile number. We'll send a verification code to confirm it's you.",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RegisterForm initialReferralCode={ref} />
      </CardContent>
    </Card>
  );
}
