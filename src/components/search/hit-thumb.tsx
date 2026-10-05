import Image from "next/image";
import { Briefcase, Package, Wrench } from "lucide-react";
import { catalogImagePublicUrlClient } from "@/lib/catalog-image-url";
import { cn } from "@/lib/utils";

const ICONS = { PRODUCT: Package, SERVICE: Wrench, PROJECT: Briefcase } as const;

/** Small square image for a search hit; falls back to the kind's icon when there's no image. */
export function HitThumb({
  kind,
  imagePath,
  alt,
  size = 40,
  className,
}: {
  kind: keyof typeof ICONS;
  imagePath: string | null;
  alt: string;
  size?: number;
  className?: string;
}) {
  const Icon = ICONS[kind];
  return (
    <span
      className={cn(
        "bg-muted text-muted-foreground relative flex shrink-0 items-center justify-center overflow-hidden rounded-md",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {imagePath ? (
        <Image
          src={catalogImagePublicUrlClient(imagePath)}
          alt={alt}
          fill
          sizes={`${size}px`}
          className="object-cover"
        />
      ) : (
        <Icon className="size-1/2" aria-hidden="true" />
      )}
    </span>
  );
}
