import { getT } from "@/i18n/server";
import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ForgotPasswordForm } from "./forgot-password-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Forgot password") };
}

export default async function ForgotPasswordPage() {
  const t = await getT();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Forgot your password?")}</CardTitle>
        <CardDescription>
          {t("Enter the email on your account and we'll send you a reset link.")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ForgotPasswordForm />
      </CardContent>
    </Card>
  );
}
