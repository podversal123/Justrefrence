"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Route-segment error boundary. Per docs/error-handling.md §4: a generic
 * apology plus a correlation id the user can quote to support — never a
 * stack trace or raw error message in the UI.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Full detail belongs in server-side logs (see src/server/lib/logger.ts);
    // this client-side console line is a development convenience only.
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="bg-destructive/10 text-destructive rounded-full p-4">
        <TriangleAlert className="size-8" />
      </div>
      <h1>Something went wrong</h1>
      <p className="text-muted-foreground max-w-sm text-sm">
        We hit an unexpected error. Try again — if this keeps happening, quote this reference:{" "}
        <code className="bg-muted rounded px-1 py-0.5">{error.digest ?? "unknown"}</code>
      </p>
      <Button onClick={() => reset()}>Try again</Button>
    </div>
  );
}
