import { getT } from "@/i18n/server";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { adStateLabel, type AdFacts } from "@/server/domain/ads/rules";
import { catalogImagePublicUrlClient } from "@/lib/catalog-image-url";

const BADGE: Record<string, "warning" | "success" | "destructive" | "secondary"> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "destructive",
};

/** The preview of one ad with its state, shared by the vendor's list and the staff review list. */
export async function AdPreview({
  ad,
  vendorName,
  children,
}: {
  ad: AdFacts & {
    headline: string;
    subline: string | null;
    ctaLabel: string;
    ctaHref: string;
    imagePath: string;
    rejectedReason: string | null;
  };
  vendorName?: string;
  children?: React.ReactNode;
}) {
  const t = await getT();
  const paused = ad.status === "APPROVED" && !ad.isActive;
  return (
    <div className="surface-card flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
      <div className="bg-muted relative aspect-[16/9] w-full shrink-0 overflow-hidden rounded-lg sm:w-56">
        <Image
          src={catalogImagePublicUrlClient(ad.imagePath)}
          alt=""
          fill
          sizes="224px"
          className="object-cover"
        />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={paused ? "secondary" : (BADGE[ad.status] ?? "secondary")}>
            {adStateLabel(ad)}
          </Badge>
          {vendorName ? <span className="text-muted-foreground text-xs">{vendorName}</span> : null}
        </div>
        <p className="font-semibold">{ad.headline}</p>
        {ad.subline ? <p className="text-muted-foreground text-sm">{ad.subline}</p> : null}
        <p className="text-sm">
          <span className="text-muted-foreground">{t("Button:")} </span>
          {ad.ctaLabel}
          <span className="text-muted-foreground">{t("goes to")} </span>
          <span className="font-mono text-xs break-all">{ad.ctaHref}</span>
        </p>
        {ad.status === "REJECTED" && ad.rejectedReason ? (
          <p className="text-destructive text-sm">
            {t("Reason: {reason}", { reason: ad.rejectedReason })}
          </p>
        ) : null}
      </div>
      {children ? <div className="flex flex-col gap-2 sm:items-end">{children}</div> : null}
    </div>
  );
}
