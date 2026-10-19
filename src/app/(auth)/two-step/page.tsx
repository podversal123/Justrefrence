import { getT } from "@/i18n/server";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath, DEFAULT_AFTER_LOGIN } from "@/lib/safe-next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { verifyTwoStepAction } from "@/server/services/two-step-actions";
import { CodeForm } from "./code-form";
import { EnrollPanel } from "./enroll-panel";
import { RemoveForm } from "./remove-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Two-step login") };
}

export default async function TwoStepPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const t = await getT();
  const next = safeNextPath((await searchParams).next);
  const nextParam = next === DEFAULT_AFTER_LOGIN ? undefined : next;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: factors }, { data: level }] = await Promise.all([
    supabase.auth.mfa.listFactors(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);
  const enrolled = (factors?.totp ?? []).length > 0;
  const verifiedThisSession = level?.currentLevel === "aal2";

  if (enrolled && !verifiedThisSession) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("Enter your code")}</CardTitle>
          <CardDescription>
            {t("Open your authenticator app and type the 6-digit code it shows.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CodeForm action={verifyTwoStepAction} next={nextParam} submitLabel={t("Continue")} />
        </CardContent>
      </Card>
    );
  }

  if (enrolled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("Two-step login is on")}</CardTitle>
          <CardDescription>
            {t("Your account asks for a code from your authenticator app each time you sign in.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Link href={next as never} className={buttonVariants({ className: "w-full" })}>
            {t("Continue")}
          </Link>
          <RemoveForm />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Set up two-step login")}</CardTitle>
        <CardDescription>
          {t("Adds a code from your phone to your password, so a stolen password is not enough.")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <EnrollPanel next={nextParam} />
      </CardContent>
    </Card>
  );
}
