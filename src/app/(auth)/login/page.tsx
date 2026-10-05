import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LoginForm } from "./login-form";
import { MobileLoginForm } from "./mobile-login-form";

export const metadata: Metadata = { title: "Sign in" };

// Email (password) and Mobile (OTP) only — Member ID is a display
// identifier, never a login credential, per docs/business-rules.md Q-32.
export default function LoginPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Choose email or mobile number to continue.</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="email">
          <TabsList className="mb-4 grid w-full grid-cols-2">
            <TabsTrigger value="email">Email</TabsTrigger>
            <TabsTrigger value="mobile">Mobile</TabsTrigger>
          </TabsList>
          <TabsContent value="email">
            <LoginForm />
          </TabsContent>
          <TabsContent value="mobile">
            <MobileLoginForm />
          </TabsContent>
        </Tabs>

        <p className="text-muted-foreground mt-4 text-center text-xs">
          New here?{" "}
          <Link href="/register" className="underline underline-offset-4">
            Create an account
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
