import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Brand mark — sourced from "Justreference Logo.jpeg" (public/brand/logo.jpg).
 * `withWordmark` pairs the mark with the product name for contexts (login,
 * sidebar header) where the mark alone isn't enough for recognition yet.
 */
export function Logo({
  size = 32,
  withWordmark = false,
  className,
}: {
  size?: number;
  withWordmark?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <Image
        src="/brand/logo.jpg"
        alt="Justreference"
        width={size}
        height={size}
        // Tailwind preflight sets `img { height: auto }`, which otherwise
        // wins over the width/height attributes above and distorts the
        // aspect ratio — pin both explicitly via inline style instead.
        style={{ width: size, height: size }}
        className="rounded-lg"
        priority
      />
      {withWordmark ? (
        <span className="text-foreground text-lg font-semibold tracking-tight">Justreference</span>
      ) : null}
    </span>
  );
}
