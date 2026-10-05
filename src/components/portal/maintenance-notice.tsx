import Link from "next/link";
import { Wrench } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { buttonVariants } from "@/components/ui/button";
import { DEFAULT_MAINTENANCE_MESSAGE } from "@/server/lib/site-settings";
import { BRAND } from "@/lib/brand";

/** Full-page notice shown to non-staff while maintenance mode is on. Sign-in stays reachable for the team. */
export function MaintenanceNotice({ message }: { message: string }) {
  return (
    <div className="bg-surface-sunken flex min-h-screen flex-col items-center justify-center px-4 py-12 text-center">
      <Logo size={44} withWordmark />
      <div className="bg-primary/10 text-primary mt-10 flex size-14 items-center justify-center rounded-full">
        <Wrench className="size-6" aria-hidden="true" />
      </div>
      <h1 className="mt-6">We&apos;ll be right back</h1>
      <p className="text-muted-foreground mt-3 max-w-md whitespace-pre-line">
        {message.trim() || DEFAULT_MAINTENANCE_MESSAGE}
      </p>
      <p className="text-muted-foreground mt-8 text-sm">{BRAND.tagline}</p>
      <Link href="/login" className={buttonVariants({ variant: "outline", className: "mt-6" })}>
        Staff sign in
      </Link>
    </div>
  );
}
