import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="bg-muted text-muted-foreground rounded-full p-4">
        <FileQuestion className="size-8" />
      </div>
      <h1>Page not found</h1>
      <p className="text-muted-foreground max-w-sm text-sm">
        The page you&apos;re looking for doesn&apos;t exist or may have moved.
      </p>
      <Button nativeButton={false} render={<Link href="/dashboard">Back to dashboard</Link>} />
    </div>
  );
}
