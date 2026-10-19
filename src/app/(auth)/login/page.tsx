import { getT } from "@/i18n/server";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button, buttonVariants } from "@/components/ui/button";
import { getAuthSession } from "@/server/auth/session";
import { describeRoles, panelLabelFor } from "@/server/auth/panel";
import { logoutAction } from "@/server/services/auth-actions";
import { safeNextPath, DEFAULT_AFTER_LOGIN } from "@/lib/safe-next";
import { LoginForm } from "./login-form";
import { MobileLoginForm } from "./mobile-login-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Sign in") };
}

// Email or 10-digit Member ID (the same number as the Referral ID) with a password, or Mobile (OTP).
// The workflow document asks for login "using Member ID or Referral ID".
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const t = await getT();
  const { next: rawNext } = await searchParams;
  const next = safeNextPath(rawNext);
  const nextParam = next === DEFAULT_AFTER_LOGIN ? undefined : next;

  // Someone who is already signed in is told so, instead of being silently sent to the dashboard of
  // the account they happen to be in. That silent redirect looked like "the other panel won't open".
  const session = await getAuthSession();
  if (session) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("You are already signed in")}</CardTitle>
          <CardDescription>
            {t("{email} is signed in to the {panel}.", {
              email: session.email,
              panel: t(panelLabelFor(session)),
            })}{" "}
            {describeRoles(session.roles)
              .split(", ")
              .map((role) => t(role))
              .join(", ")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Link href={next as never} className={buttonVariants({ className: "w-full" })}>
            {t("Continue to my account")}
          </Link>
          <form action={logoutAction}>
            <Button type="submit" variant="outline" className="w-full">
              {t("Sign out and use another account")}
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Sign in")}</CardTitle>
        <CardDescription>
          {t("Sign in with your email or Member ID, or with your mobile number.")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="email">
          <TabsList className="mb-4 grid w-full grid-cols-2">
            <TabsTrigger value="email">{t("Email")}</TabsTrigger>
            <TabsTrigger value="mobile">{t("Mobile")}</TabsTrigger>
          </TabsList>
          <TabsContent value="email">
            <LoginForm next={nextParam} />
          </TabsContent>
          <TabsContent value="mobile">
            <MobileLoginForm next={nextParam} />
          </TabsContent>
        </Tabs>

        <p className="text-muted-foreground mt-4 text-center text-xs">
          {t("New here?")}{" "}
          <Link href="/register" className="underline underline-offset-4">
            {t("Create an account")}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
