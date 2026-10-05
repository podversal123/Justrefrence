import type { Metadata } from "next";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Access denied" };

export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="bg-destructive/10 text-destructive rounded-full p-4">
        <ShieldAlert className="size-8" />
      </div>
      <h1>You don&apos;t have access to this page</h1>
      <p className="text-muted-foreground max-w-sm text-sm">
        Your account doesn&apos;t have the permission required to view this. If you think this is a
        mistake, contact an administrator.
      </p>
      <Button nativeButton={false} render={<Link href="/dashboard">Back to dashboard</Link>} />
    </div>
  );
}
