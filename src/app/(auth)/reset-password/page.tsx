import { getT } from "@/i18n/server";
import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ResetPasswordForm } from "./reset-password-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Reset password") };
}

export default async function ResetPasswordPage() {
  const t = await getT();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Choose a new password")}</CardTitle>
        <CardDescription>{t("This link is single-use and expires shortly.")}</CardDescription>
      </CardHeader>
      <CardContent>
        <ResetPasswordForm />
      </CardContent>
    </Card>
  );
}
